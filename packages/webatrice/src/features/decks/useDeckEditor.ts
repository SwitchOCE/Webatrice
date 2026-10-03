import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from '@bufbuild/protobuf';

import { useTranslation } from 'react-i18next';
import { server } from '@cockatrice/datatrice';
import type { CommandFailedPayload } from '@cockatrice/datatrice';
import type { WebClient } from '@cockatrice/sockatrice';
import {
  Command_DeckUpload_ext,
  Command_DeckUploadSchema,
  Response_DeckUpload_ext,
} from '@cockatrice/sockatrice/generated';
import { useAppSelector } from '@app/store';
import { useCommandFailureMessage, useReduxEffect, useRequestTracker } from '@app/hooks';
import { lookupCard, parseCod, serializeCod, touchMeta, trackEvent } from '@app/services';
import type { BracketAssessment } from '@app/types';
import { useWebClient } from '@cockatrice/datatrice/react';

import { getCachedDeck, setCachedDeck } from './deckEditorCache';
import {
  adjustCardQuantity,
  appendCard,
  findMainboardRow,
  normalizeAddedCardName,
  patchCard,
  removeCard,
  renameDeck,
  setCardCategory,
  setCardCommander,
  setDeckBracketAssessment,
  setDeckDescription,
  setDeckFormat,
  setDeckPriceCache,
} from './deckEdits';
import { countDeckCards } from './deckGrouping';
import { assembleDeckCard, hydrateDeck } from './hydrate';
import type { DeckCard, HydratedDeck } from './types';

/**
 * State + actions the DeckEditor UI uses. Splitting the hook out of
 * the component keeps the component tree focused on rendering; all
 * network + Redux plumbing (download → parse → hydrate → autosave)
 * lives here.
 *
 * Data flow on mount:
 *   1. `deckDownload(deckId)` fires.
 *   2. `useReduxEffect(DECK_DOWNLOADED)` checks the deck and request
 *      identities, parses + hydrates the XML, then checks ownership again.
 *      Background downloads and superseded lookups cannot replace this deck.
 *   3. `deck` state is populated, `loading` flips to false.
 *
 * Auto-save:
 *   • Every mutation updates `deck` locally (optimistic).
 *   • A 500ms debounced effect serializes the deck to `.cod` XML and
 *     calls `uploadDeckUpdate(deckId, xml)` (a local helper that
 *     bypasses the sockatrice wrapper — see the note on that
 *     function for the proto2 `path`-presence bug it works around).
 *   • On the server ack, `uploadDeckUpdate` (a) refetches the deck
 *     list so MyDecks + sticky tab titles reflect the change without
 *     a manual refresh, and (b) fires the caller's onDone so we can
 *     flip the save indicator from "Saving…" to "Saved".
 */

const AUTOSAVE_DEBOUNCE_MS = 500;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';

export interface UseDeckEditor {
  deck: HydratedDeck | null;
  loading: boolean;
  notFound: boolean;
  /** Why the deck could not be downloaded (timeout, lost connection, server
   *  rejection); null while loading or once loaded. Set alongside notFound. */
  loadError: string | null;
  saveState: SaveState;
  /** Total (main + commander), excluding sideboard, for the header. */
  totalMainboardCount: number;
  totalSideboardCount: number;

  // --- Mutations (all optimistic; each schedules an autosave) ---
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  /** Set the deck's format (`commander`, `modern`, `other`, or any
   *  custom string). Persists to the `<format>` element via autosave.
   *  Editor UI gates MTG-specific features off this value. */
  setFormat: (format: string) => void;
  /** Persist a freshly-computed price cache into meta.priceUsd /
   *  priceMissingCount. Used by the sidebar's Buy button after
   *  Scryfall lookups so the totals survive a reload. */
  setPriceCache: (priceUsd: number | undefined, priceMissingCount: number | undefined) => void;
  /** Persist a freshly-computed bracket assessment onto the deck.
   *  Writes to the `<bracketAssessment>` XML element (level +
   *  flagged card lists + a deck fingerprint for staleness detection)
   *  AND mirrors `level` into `meta.bracketLevel` so legacy consumers
   *  that only read the JSON blob keep working. Passing `undefined`
   *  clears both caches — used when the assessment failed. */
  setBracketAssessment: (assessment: BracketAssessment | undefined) => void;
  updateCard: (index: number, patch: Partial<DeckCard>) => void;
  deleteCard: (index: number) => void;
  incQuantity: (index: number, delta: number) => void;
  setCategory: (index: number, category: DeckCard['category']) => void;
  /** Toggle the commander marker on a card. Independent of category.
   *  See DeckCard.isCommander for the full rationale. */
  setCommander: (index: number, isCommander: boolean) => void;
  /**
   * Add a card by name to the mainboard. If the mainboard already
   * has a row for this card (case-insensitive), that row's quantity
   * is incremented — matches the "no duplicate rows" convention
   * fancy webatrice uses. Async because it may look up the card via
   * Dexie / Scryfall to hydrate metadata.
   */
  addCard: (name: string) => Promise<void>;
  /** Force a save right now (bypass debounce). Useful on unmount. */
  flushSave: () => void;
}

// (pendingLocalSaveRef removed — the DECK_UPLOAD-listening race with
//  MyDecks is no longer relevant since our custom `uploadDeckUpdate`
//  does not dispatch that action.)

export function useDeckEditor(deckId: number | null): UseDeckEditor {
  const webClient = useWebClient();
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const requests = useRequestTracker();

  // Hydrate initial state from the module cache if we've already
  // loaded this deck this session — avoids the "Loading…" flash and
  // the deckDownload round-trip when returning to an open deck tab.
  const initialCached = deckId != null ? getCachedDeck(deckId) : undefined;
  const [deck, setDeck] = useState<HydratedDeck | null>(initialCached?.deck ?? null);
  const [loading, setLoading] = useState(!initialCached);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();

  // Refs used by the autosave loop. `deckRef` mirrors state so the
  // debounced timer sees the latest snapshot without needing to be in
  // the effect's deps.
  const deckRef = useRef<HydratedDeck | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const savedSignatureRef = useRef<string | null>(initialCached?.savedXml ?? null);

  // The route keeps this hook mounted across `/deck/:deckId` changes,
  // so re-seed per deckId: otherwise switching to a cached deck keeps
  // the previous deck in state and the next autosave uploads it under
  // the new id. Adjusting state during render (rather than in an
  // effect) means no effect ever runs with the new id and the old deck.
  const [seededDeckId, setSeededDeckId] = useState(deckId);
  if (seededDeckId !== deckId) {
    const cached = deckId != null ? getCachedDeck(deckId) : undefined;
    setSeededDeckId(deckId);
    setDeck(cached?.deck ?? null);
    setLoading(!cached);
    setNotFound(false);
    setSaveState('idle');
  }

  // Synced in an effect, not during render: on a deckId change the
  // previous id's unmount flush runs before this, so it still
  // serializes the deck its pending edit was made on.
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  // --- Load ---
  useEffect(() => {
    requests.cancel();
    if (deckId == null) {
      return;
    }
    // Cached: state already seeded from the cache above; skip the
    // network round-trip entirely so tab switches feel instant.
    const cached = getCachedDeck(deckId);
    if (cached) {
      savedSignatureRef.current = cached.savedXml;
      setLoading(false);
      setNotFound(false);
      return;
    }
    if (!isConnected) {
      return;
    }
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    setDeck(null);
    savedSignatureRef.current = null;
    const requestId = requests.begin();
    requests.track(requestId);
    webClient.request.session.deckDownload(deckId, requestId);
    return requests.cancel;
  }, [isConnected, deckId, webClient, requests]);

  useReduxEffect<{ deckId: number; deck: string; requestId?: string }>(
    ({ payload }) => {
      if (payload.deckId !== deckId || !requests.isCurrent(payload.requestId) || !requests.settle(payload.requestId)) {
        return;
      }
      (async () => {
        try {
          const parsed = parseCod(payload.deck);
          const hydrated = await hydrateDeck(parsed);
          // Parsing/hydration may outlive navigation, unmount or session end.
          if (!requests.isCurrent(payload.requestId)) {
            return;
          }
          requests.cancel();
          setDeck(hydrated);
          savedSignatureRef.current = payload.deck;
          // Analytics: capture the format distribution across opened
          // decks. Normalized `hydrated.format` (defaults to `commander`
          // when the .cod's <format> element is missing) so bucket
          // counts stay consistent with what the editor UI shows.
          trackEvent('deck_opened', { format: hydrated.format });
          // Seed the cache so subsequent mounts of this deck skip the
          // download + parse + hydrate round-trip. `deck`-change
          // effect below keeps the entry up to date after edits.
          setCachedDeck(payload.deckId, { deck: hydrated, savedXml: payload.deck });
          setLoading(false);
          setSaveState('idle');
          // Legacy decks with no <format> element get defaulted to
          // commander during hydration. Nudge an autosave so that
          // default gets written back to the file even when the user
          // opens the deck and closes without editing. `scheduleSave`
          // debounces + `persistNow` early-returns when the serialized
          // XML matches savedSignatureRef, so this is a no-op for
          // decks that already had a format on file.
          //
          // Also nudge for legacy decks with a `<zone
          // name="commander">` block. parseCod coerces those cards
          // into the main zone with `isCommander: true`, but the
          // stored XML still has the old shape until we re-save it.
          // Servatrice's setupZones only reads main + side, so an
          // un-migrated file drops the commander from the library.
          const hasLegacyCommanderZone = payload.deck.includes('<zone name="commander"');
          if (!parsed.format.trim() || hasLegacyCommanderZone) {
            scheduleSave();
          }
        } catch (err) {
          if (!requests.isCurrent(payload.requestId)) {
            return;
          }
          requests.cancel();
          console.error('Failed to parse deck XML', err);
          setNotFound(true);
          setLoading(false);
        }
      })();
    },
    server.Types.DECK_DOWNLOADED,
    [deckId, requests],
  );

  // A failed download would otherwise leave the editor skeleton up forever.
  useReduxEffect<CommandFailedPayload & { deckId: number }>(
    ({ payload }) => {
      if (payload.deckId !== deckId || !requests.isCurrent(payload.requestId) || !requests.settle(payload.requestId)) {
        return;
      }
      requests.cancel();
      setLoadError(describeFailure(payload.failure, t('DeckEditor.downloadFailed')));
      setNotFound(true);
      setLoading(false);
    },
    server.Types.DECK_DOWNLOAD_FAILED,
    [deckId, describeFailure, t, requests],
  );

  // --- Save (debounced) ---
  const persistNow = useCallback(() => {
    const current = deckRef.current;
    if (!current || deckId == null) {
      return;
    }
    const nextMeta = touchMeta(current.meta);
    const xml = serializeCod({
      name: current.name,
      meta: nextMeta,
      cards: current.cards,
      format: current.format,
      bannerCard: current.bannerCard,
      lastLoadedTimestamp: current.lastLoadedTimestamp,
      tagsXml: current.tagsXml,
      bracketAssessment: current.bracketAssessment,
    });
    if (xml === savedSignatureRef.current) {
      return;
    } // nothing changed
    const previousSignature = savedSignatureRef.current;
    savedSignatureRef.current = xml;
    // Refresh the cached saved-signature so a remount after autosave
    // still sees the deck as "clean" (matches the last-known-saved
    // XML) and doesn't queue a spurious re-save.
    const cached = getCachedDeck(deckId);
    if (cached) {
      setCachedDeck(deckId, { deck: cached.deck, savedXml: xml });
    }
    setSaveState('saving');
    // uploadDeckUpdate handles both the server "saved" ack (flips our
    // saveState) and a follow-up deckList refetch that keeps MyDecks
    // + the sticky tab title in sync without needing a manual refresh.
    uploadDeckUpdate(webClient, deckId, xml, () => setSaveState('saved'), () => {
      // Not saved: forget the optimistic signature (here and in the cache) so
      // the next edit or unmount flush sends this content again.
      if (savedSignatureRef.current === xml) {
        savedSignatureRef.current = previousSignature;
      }
      const entry = getCachedDeck(deckId);
      if (entry?.savedXml === xml) {
        setCachedDeck(deckId, { deck: entry.deck, savedXml: previousSignature ?? '' });
      }
      setSaveState('failed');
    });
  }, [deckId, webClient]);

  const scheduleSave = useCallback(() => {
    setSaveState('dirty');
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persistNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [persistNow]);

  // Flush pending save on unmount so tab-close / navigate-away
  // doesn't drop the last edit.
  const flushSave = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      persistNow();
    }
  }, [persistNow]);
  useEffect(() => flushSave, [flushSave]);

  // Mirror local edits into the module cache so returning to this
  // deck's tab after switching away shows the latest in-editor state
  // (including unsaved edits), not the last-downloaded XML. Runs after
  // every setDeck — cheap, just a Map.set.
  useEffect(() => {
    if (deckId == null || !deck) {
      return;
    }
    const existing = getCachedDeck(deckId);
    setCachedDeck(deckId, {
      deck,
      savedXml: existing?.savedXml ?? savedSignatureRef.current ?? '',
    });
  }, [deckId, deck]);

  // --- Mutations ---
  // Each applies a pure transition from `deckEdits` optimistically and
  // schedules the autosave.
  const applyEdit = useCallback(
    (edit: (current: HydratedDeck) => HydratedDeck) => {
      setDeck((prev) => (prev ? edit(prev) : prev));
      scheduleSave();
    },
    [scheduleSave],
  );

  const setName = useCallback((name: string) => applyEdit((d) => renameDeck(d, name)), [applyEdit]);
  const setFormat = useCallback((format: string) => applyEdit((d) => setDeckFormat(d, format)), [applyEdit]);
  const setDescription = useCallback(
    (description: string) => applyEdit((d) => setDeckDescription(d, description)),
    [applyEdit],
  );
  // Skips the state churn when the values already match (the pricing
  // effect re-fires on every editor open).
  const setPriceCache = useCallback(
    (priceUsd: number | undefined, priceMissingCount: number | undefined) =>
      applyEdit((d) => setDeckPriceCache(d, priceUsd, priceMissingCount)),
    [applyEdit],
  );
  // Skips the churn when the assessment matches what is already on disk
  // (a reopened deck replays the same result).
  const setBracketAssessment = useCallback(
    (assessment: BracketAssessment | undefined) => applyEdit((d) => setDeckBracketAssessment(d, assessment)),
    [applyEdit],
  );
  const updateCard = useCallback(
    (index: number, patch: Partial<DeckCard>) => applyEdit((d) => patchCard(d, index, patch)),
    [applyEdit],
  );
  const deleteCard = useCallback((index: number) => applyEdit((d) => removeCard(d, index)), [applyEdit]);
  const incQuantity = useCallback(
    (index: number, delta: number) => applyEdit((d) => adjustCardQuantity(d, index, delta)),
    [applyEdit],
  );
  const setCategory = useCallback(
    (index: number, category: DeckCard['category']) => applyEdit((d) => setCardCategory(d, index, category)),
    [applyEdit],
  );
  const setCommander = useCallback(
    (index: number, isCommander: boolean) => applyEdit((d) => setCardCommander(d, index, isCommander)),
    [applyEdit],
  );

  const addCard = useCallback(
    async (name: string) => {
      const trimmed = normalizeAddedCardName(name);
      if (!trimmed) {
        return;
      }
      // One row per (name, zone): an existing mainboard row is bumped.
      const current = deckRef.current;
      if (current) {
        const existingIdx = findMainboardRow(current, trimmed);
        if (existingIdx >= 0) {
          applyEdit((d) => adjustCardQuantity(d, existingIdx, 1));
          return;
        }
      }
      // Otherwise look the card up and append a new mainboard row.
      const lookup = await lookupCard(trimmed);
      const newCard = assembleDeckCard({ name: trimmed, quantity: 1, category: 'main' }, lookup);
      applyEdit((d) => appendCard(d, newCard));
    },
    [applyEdit],
  );

  const { totalMainboardCount, totalSideboardCount } = countDeckCards(deck?.cards);

  return {
    deck,
    loading,
    notFound,
    loadError,
    saveState,
    totalMainboardCount,
    totalSideboardCount,
    setName,
    setDescription,
    setFormat,
    setPriceCache,
    setBracketAssessment,
    updateCard,
    deleteCard,
    incQuantity,
    setCategory,
    setCommander,
    addCard,
    flushSave,
  };
}

/**
 * Send a Command_DeckUpload that Servatrice treats as an **update**
 * (not a create), then refetch the deck list on success so the local
 * tree stays consistent.
 *
 * Why bypass `webClient.request.session.deckUpload`: sockatrice's
 * wrapper always passes `path` in the constructor object, so the
 * proto2 `optional string path` field is marked as present on the
 * wire — even when the string is empty. Servatrice's C++ handler
 * branches on path-presence first ("path was sent → create at this
 * folder"), silently ignoring `deck_id`. Result: every autosave
 * would spawn a new deck at root instead of replacing the existing
 * one. Constructing the message with just `{ deckId, deckList }`
 * omits the path field entirely, so the server takes the deck_id
 * update path.
 *
 * We can't reuse the wrapper's `uploadServerDeck` reducer dispatch
 * either — that reducer INSERTs the returned tree item and doesn't
 * dedupe by id, so a successful update would visually duplicate the
 * deck in the local tree. Instead we fire `deckList()` on success:
 * the response replaces `backendDecks` wholesale, so MyDecks and
 * the sticky tab titles always see server truth. Cost: one extra
 * round-trip per autosave, which is cheap compared to the deck-upload
 * payload itself.
 */
function uploadDeckUpdate(
  webClient: WebClient,
  deckId: number,
  deckList: string,
  onDone?: () => void,
  onFailed?: () => void,
): void {
  webClient.protobuf.sendSessionCommand(
    Command_DeckUpload_ext,
    create(Command_DeckUploadSchema, { deckId, deckList }),
    {
      responseExt: Response_DeckUpload_ext,
      onSuccess: () => {
        // "Saved" indicator fires immediately per-save so the UI
        // stays responsive; the tree refetch is debounced so a
        // rapid edit stream doesn't spam deckList() at the server.
        onDone?.();
        scheduleDeckListRefetch(webClient);
      },
      // Server rejection, timeout or lost connection: the deck was not saved.
      onError: () => onFailed?.(),
    },
  );
}

// Module-level debounce timer so rapid successive saves collapse into
// a single deckList() refetch after the storm settles. 500ms matches
// the autosave debounce — long enough to coalesce a typing burst,
// short enough that MyDecks and the sticky-tab title feel live.
const DECK_LIST_REFETCH_DEBOUNCE_MS = 500;
let deckListRefetchTimer: number | null = null;

function scheduleDeckListRefetch(webClient: WebClient): void {
  if (deckListRefetchTimer != null) {
    window.clearTimeout(deckListRefetchTimer);
  }
  deckListRefetchTimer = window.setTimeout(() => {
    deckListRefetchTimer = null;
    webClient.request.session.deckList();
  }, DECK_LIST_REFETCH_DEBOUNCE_MS);
}
