import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';
import type { CommandFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { lookupCard, parseCod, trackEvent } from '@app/services';
import { useAppSelector } from '@app/store';
import type { BracketAssessment } from '@app/types';

import { getCachedDeck, setCachedDeck } from '../deckEditorCache';
import {
  adjustCardQuantity,
  appendCard,
  findMainboardRow,
  normalizeAddedCardName,
  removeCard,
  renameDeck,
  setCardCategory,
  setCardCommander,
  setCardPrinting,
  setDeckBanner,
  setDeckBracketAssessment,
  setDeckDescription,
  setDeckFormat,
  setDeckPriceCache,
  setDeckTags,
  type CardPrinting,
} from '../deckEdits';
import { countDeckCards } from '../deckGrouping';
import {
  DESCRIPTION_COALESCE_MS,
  RENAME_COALESCE_MS,
  type DeckHistory,
  type DeckHistoryReason,
} from '../deckHistory';
import { deckSaveSignature } from '../deckPersistence';
import type { BannerCandidate } from '../deckTags';
import { assembleDeckCard, hydrateDeck } from '../hydrate';
import type { DeckCard, HydratedDeck } from '../types';
import { useDeckAutosave, type SaveState } from './useDeckAutosave';
import { useDeckHistory } from './useDeckHistory';

export type { SaveState } from './useDeckAutosave';

/**
 * State and actions behind the deck editor route: download → parse →
 * hydrate → optimistic edits → debounced autosave.
 *
 * On mount `deckDownload(deckId)` fires; the DECK_DOWNLOADED effect
 * checks the payload's deck id (guarding against a different deck's
 * in-flight response), parses and hydrates the XML, and populates
 * `deck`. A deck already opened this session is served from the
 * session cache instead, with no round-trip.
 *
 * Every mutation applies a pure transition from `deckEdits` locally,
 * records a named memento of the previous deck for undo (`useDeckHistory`;
 * derived caches such as the price are not recorded) and schedules the
 * autosave (`useDeckAutosave`), which sends the deck as a deck-id update.
 * Loading a deck from the server starts a fresh history.
 */
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
  /** Set the deck's format (`commander`, `modern`, or any custom string).
   *  Persists to the `<format>` element; the editor gates MTG-specific
   *  features off this value. */
  setFormat: (format: string) => void;
  /** Pick the deck's banner card, or clear it with `null`. */
  setBanner: (banner: BannerCandidate | null) => void;
  /** Replace the deck's tags. */
  setTags: (tags: readonly string[]) => void;
  /** Cache a computed price in meta.priceUsd / priceMissingCount so the
   *  totals survive a reload. */
  setPriceCache: (priceUsd: number | undefined, priceMissingCount: number | undefined) => void;
  /** Cache a bracket assessment in `<bracketAssessment>` (level, flagged
   *  cards and a deck fingerprint for staleness detection), mirroring the
   *  level into `meta.bracketLevel`. `undefined` clears both. */
  setBracketAssessment: (assessment: BracketAssessment | undefined) => void;
  /** Switch a row to another printing of the same card. */
  setPrinting: (index: number, printing: CardPrinting) => void;
  deleteCard: (index: number) => void;
  incQuantity: (index: number, delta: number) => void;
  setCategory: (index: number, category: DeckCard['category']) => void;
  /** Toggle the commander marker on a card. Independent of category.
   *  See DeckCard.isCommander for the full rationale. */
  setCommander: (index: number, isCommander: boolean) => void;
  /** Add a card by name to the mainboard, incrementing an existing
   *  mainboard row for it (case-insensitive). Async because a new card
   *  is looked up in the card catalog. */
  addCard: (name: string) => Promise<void>;
  /** Save a pending change right now (bypass the debounce). */
  flushSave: () => void;
  /** Send the deck again after a failed save. */
  retrySave: () => void;

  // --- Undo/redo (desktop DeckStateManager + DeckListHistoryManager) ---
  history: DeckHistory;
  canUndo: boolean;
  canRedo: boolean;
  /** Undo `steps` edits (default 1); a history-list click jumps several. */
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
}

export function useDeckEditor(deckId: number | null): UseDeckEditor {
  const webClient = useWebClient();
  const isConnected = useAppSelector(server.Selectors.getIsConnected);

  // Seed from the session cache when this deck was opened before —
  // avoids the "Loading…" flash and the download on a tab return.
  const initialCached = deckId != null ? getCachedDeck(deckId) : undefined;
  const [deck, setDeck] = useState<HydratedDeck | null>(initialCached?.deck ?? null);
  const [loading, setLoading] = useState(!initialCached);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();

  // Mirrors state so the autosave timer and back-to-back edits read the
  // latest snapshot. Every write below updates it before `setDeck`.
  const deckRef = useRef<HydratedDeck | null>(null);
  const readDeck = useCallback(() => deckRef.current, []);

  const autosave = useDeckAutosave(deckId, readDeck, initialCached?.savedSignature ?? null);
  const { scheduleSave, markSaved, resetSaved, savedSignature } = autosave;
  const history = useDeckHistory();
  const { record, clear: clearHistory, undo: undoHistory, redo: redoHistory } = history;

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
  }

  // Synced in an effect, not during render: on a deckId change the
  // previous id's unmount flush runs before this, so it still
  // serializes the deck its pending edit was made on.
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  // --- Load ---
  useEffect(() => {
    if (deckId == null) {
      return;
    }
    // Cached: state was seeded above, so skip the round-trip entirely.
    // A deck switched to from another keeps its own saved signature.
    const cached = getCachedDeck(deckId);
    if (cached) {
      if (savedSignature() !== cached.savedSignature) {
        if (cached.savedSignature == null) {
          resetSaved();
        } else {
          markSaved(cached.savedSignature);
        }
      }
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
    resetSaved();
    webClient.request.session.deckDownload(deckId);
  }, [isConnected, deckId, webClient, resetSaved, markSaved, savedSignature]);

  useReduxEffect<{ deckId: number; deck: string }>(
    ({ payload }) => {
      if (payload.deckId !== deckId) {
        return;
      }
      (async () => {
        try {
          const parsed = parseCod(payload.deck);
          const hydrated = await hydrateDeck(parsed);
          // Write migrations back even if the user never edits:
          //   • decks with no <format> were defaulted to commander;
          //   • legacy `<zone name="commander">` cards were coerced into
          //     main with `isCommander`, but Servatrice's setupZones only
          //     reads main + side, so the stored file must be rewritten or
          //     the commander drops out of the library.
          // A null signature makes the next save upload unconditionally.
          const hasLegacyCommanderZone = payload.deck.includes('<zone name="commander"');
          const needsMigration = !parsed.format.trim() || hasLegacyCommanderZone;
          const signature = needsMigration ? null : deckSaveSignature(hydrated);
          deckRef.current = hydrated;
          setDeck(hydrated);
          clearHistory();
          if (signature == null) {
            resetSaved();
          } else {
            markSaved(signature);
          }
          // Analytics: format distribution across opened decks, using the
          // normalized format the editor shows (absent → commander).
          trackEvent('deck_opened', { format: hydrated.format });
          setCachedDeck(payload.deckId, { deck: hydrated, savedSignature: signature });
          setLoading(false);
          if (needsMigration) {
            scheduleSave();
          }
        } catch (err) {
          console.error('Failed to parse deck XML', err);
          setNotFound(true);
          setLoading(false);
        }
      })();
    },
    server.Types.DECK_DOWNLOADED,
    [deckId],
  );

  // A failed download would otherwise leave the editor skeleton up forever.
  useReduxEffect<CommandFailedPayload & { deckId: number }>(
    ({ payload }) => {
      if (payload.deckId !== deckId) {
        return;
      }
      setLoadError(describeFailure(payload.failure, t('DeckEditor.downloadFailed')));
      setNotFound(true);
      setLoading(false);
    },
    server.Types.DECK_DOWNLOAD_FAILED,
    [deckId, describeFailure, t],
  );

  // Mirror edits (including unsaved ones) into the session cache so a
  // tab return shows the in-editor state, not the last download.
  useEffect(() => {
    if (deckId == null || !deck) {
      return;
    }
    const existing = getCachedDeck(deckId);
    setCachedDeck(deckId, {
      deck,
      savedSignature: existing ? existing.savedSignature : savedSignature(),
    });
  }, [deckId, deck, savedSignature]);

  // --- Mutations ---
  // Applies `edit` to the latest deck. A user edit passes the `reason` it
  // is listed under in the undo history (desktop `DeckStateManager`
  // `modifyDeck` / `requestHistorySave`); derived caches pass none. An
  // edit that returns the same deck is not an edit at all.
  const applyEdit = useCallback(
    (edit: (current: HydratedDeck) => HydratedDeck, reason?: DeckHistoryReason, coalesceMs?: number) => {
      const before = deckRef.current;
      if (!before) {
        return;
      }
      const next = edit(before);
      if (next === before) {
        return;
      }
      if (reason) {
        record(before, reason, coalesceMs);
      }
      deckRef.current = next;
      setDeck(next);
      scheduleSave();
    },
    [record, scheduleSave],
  );

  /** A user edit to the card at `index`, named after that card. */
  const editCard = useCallback(
    (index: number, edit: (current: HydratedDeck) => HydratedDeck, reason: (card: DeckCard) => DeckHistoryReason) => {
      const card = deckRef.current?.cards[index];
      if (card) {
        applyEdit(edit, reason(card));
      }
    },
    [applyEdit],
  );

  // Undo/redo restore a whole deck; the autosave then settles the server
  // on it (or sends nothing when it matches the last save).
  const restore = useCallback(
    (step: (current: HydratedDeck) => HydratedDeck | null) => {
      const current = deckRef.current;
      const restored = current ? step(current) : null;
      if (!restored) {
        return;
      }
      deckRef.current = restored;
      setDeck(restored);
      scheduleSave();
    },
    [scheduleSave],
  );
  const undo = useCallback((steps = 1) => restore((d) => undoHistory(d, steps)), [restore, undoHistory]);
  const redo = useCallback((steps = 1) => restore((d) => redoHistory(d, steps)), [restore, redoHistory]);

  const setName = useCallback(
    (name: string) => applyEdit(
      (d) => renameDeck(d, name),
      { kind: 'rename', from: deckRef.current?.name ?? '', to: name },
      RENAME_COALESCE_MS,
    ),
    [applyEdit],
  );
  const setFormat = useCallback(
    (format: string) => applyEdit((d) => setDeckFormat(d, format), { kind: 'format', format }),
    [applyEdit],
  );
  const setDescription = useCallback(
    (description: string) => applyEdit(
      (d) => setDeckDescription(d, description),
      { kind: 'description', before: deckRef.current?.meta.description?.length ?? 0, after: description.length },
      DESCRIPTION_COALESCE_MS,
    ),
    [applyEdit],
  );
  const setBanner = useCallback(
    (banner: BannerCandidate | null) => applyEdit(
      (d) => setDeckBanner(d, banner),
      banner ? { kind: 'banner', name: banner.name } : { kind: 'bannerCleared' },
    ),
    [applyEdit],
  );
  const setTags = useCallback(
    (tags: readonly string[]) => applyEdit((d) => setDeckTags(d, tags), { kind: 'tags' }),
    [applyEdit],
  );
  const setPriceCache = useCallback(
    (priceUsd: number | undefined, priceMissingCount: number | undefined) =>
      applyEdit((d) => setDeckPriceCache(d, priceUsd, priceMissingCount)),
    [applyEdit],
  );
  const setBracketAssessment = useCallback(
    (assessment: BracketAssessment | undefined) => applyEdit((d) => setDeckBracketAssessment(d, assessment)),
    [applyEdit],
  );
  const setPrinting = useCallback(
    (index: number, printing: CardPrinting) => editCard(
      index,
      (d) => setCardPrinting(d, index, printing),
      (card) => ({ kind: 'changePrinting', name: card.name, set: printing.set ?? '' }),
    ),
    [editCard],
  );
  const deleteCard = useCallback(
    (index: number) => editCard(index, (d) => removeCard(d, index), (card) => ({ kind: 'removeCard', name: card.name })),
    [editCard],
  );
  const incQuantity = useCallback(
    (index: number, delta: number) => editCard(
      index,
      (d) => adjustCardQuantity(d, index, delta),
      (card) => ({ kind: 'adjustCard', delta, name: card.name }),
    ),
    [editCard],
  );
  const setCategory = useCallback(
    (index: number, category: DeckCard['category']) => editCard(
      index,
      (d) => setCardCategory(d, index, category),
      (card) => ({ kind: 'moveCard', count: card.quantity, name: card.name, zone: category }),
    ),
    [editCard],
  );
  const setCommander = useCallback(
    (index: number, isCommander: boolean) => editCard(
      index,
      (d) => setCardCommander(d, index, isCommander),
      (card) => ({ kind: isCommander ? 'setCommander' : 'unsetCommander', name: card.name }),
    ),
    [editCard],
  );

  const addCard = useCallback(
    async (name: string) => {
      const trimmed = normalizeAddedCardName(name);
      if (!trimmed) {
        return;
      }
      const current = deckRef.current;
      if (current) {
        const existingIdx = findMainboardRow(current, trimmed);
        if (existingIdx >= 0) {
          // Desktop `DeckStateManager::addCard` names an add the same way
          // whether it creates the row or bumps it.
          editCard(
            existingIdx,
            (d) => adjustCardQuantity(d, existingIdx, 1),
            (card) => ({ kind: 'addCard', zone: 'main', name: card.name }),
          );
          return;
        }
      }
      const lookup = await lookupCard(trimmed);
      const newCard = assembleDeckCard({ name: trimmed, quantity: 1, category: 'main' }, lookup);
      applyEdit((d) => appendCard(d, newCard), { kind: 'addCard', zone: 'main', name: newCard.name });
    },
    [applyEdit, editCard],
  );

  const { totalMainboardCount, totalSideboardCount } = countDeckCards(deck?.cards);

  return {
    deck,
    loading,
    notFound,
    loadError,
    saveState: autosave.saveState,
    totalMainboardCount,
    totalSideboardCount,
    setName,
    setDescription,
    setFormat,
    setBanner,
    setTags,
    setPriceCache,
    setBracketAssessment,
    setPrinting,
    deleteCard,
    incQuantity,
    setCategory,
    setCommander,
    addCard,
    flushSave: autosave.flushSave,
    retrySave: scheduleSave,
    history: history.history,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo,
    redo,
  };
}
