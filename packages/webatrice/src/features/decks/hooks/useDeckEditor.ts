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
  patchCard,
  removeCard,
  renameDeck,
  setCardCategory,
  setCardCommander,
  setDeckBracketAssessment,
  setDeckDescription,
  setDeckFormat,
  setDeckPriceCache,
} from '../deckEdits';
import { countDeckCards } from '../deckGrouping';
import { assembleDeckCard, hydrateDeck } from '../hydrate';
import type { DeckCard, HydratedDeck } from '../types';
import { useDeckAutosave, type SaveState } from './useDeckAutosave';

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
 * Every mutation applies a pure transition from `deckEdits` locally and
 * schedules the autosave (`useDeckAutosave`), which uploads the deck as
 * a deck-id update and refreshes the deck tree on the server's ack.
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
  /** Cache a computed price in meta.priceUsd / priceMissingCount so the
   *  totals survive a reload. */
  setPriceCache: (priceUsd: number | undefined, priceMissingCount: number | undefined) => void;
  /** Cache a bracket assessment in `<bracketAssessment>` (level, flagged
   *  cards and a deck fingerprint for staleness detection), mirroring the
   *  level into `meta.bracketLevel`. `undefined` clears both. */
  setBracketAssessment: (assessment: BracketAssessment | undefined) => void;
  updateCard: (index: number, patch: Partial<DeckCard>) => void;
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

  // Mirrors state so the autosave timer reads the latest snapshot.
  const deckRef = useRef<HydratedDeck | null>(null);
  const readDeck = useCallback(() => deckRef.current, []);

  const autosave = useDeckAutosave(deckId, readDeck, initialCached?.savedXml ?? null);
  const { scheduleSave, markSaved, resetSaved, savedXml } = autosave;

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
      if (savedXml() !== cached.savedXml) {
        markSaved(cached.savedXml);
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
  }, [isConnected, deckId, webClient, resetSaved, markSaved, savedXml]);

  useReduxEffect<{ deckId: number; deck: string }>(
    ({ payload }) => {
      if (payload.deckId !== deckId) {
        return;
      }
      (async () => {
        try {
          const parsed = parseCod(payload.deck);
          const hydrated = await hydrateDeck(parsed);
          setDeck(hydrated);
          markSaved(payload.deck);
          // Analytics: format distribution across opened decks, using the
          // normalized format the editor shows (absent → commander).
          trackEvent('deck_opened', { format: hydrated.format });
          setCachedDeck(payload.deckId, { deck: hydrated, savedXml: payload.deck });
          setLoading(false);
          // Write migrations back even if the user never edits:
          //   • decks with no <format> were defaulted to commander;
          //   • legacy `<zone name="commander">` cards were coerced into
          //     main with `isCommander`, but Servatrice's setupZones only
          //     reads main + side, so the stored file must be rewritten or
          //     the commander drops out of the library.
          const hasLegacyCommanderZone = payload.deck.includes('<zone name="commander"');
          if (!parsed.format.trim() || hasLegacyCommanderZone) {
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
      savedXml: existing?.savedXml ?? savedXml() ?? '',
    });
  }, [deckId, deck, savedXml]);

  // --- Mutations ---
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
  const setPriceCache = useCallback(
    (priceUsd: number | undefined, priceMissingCount: number | undefined) =>
      applyEdit((d) => setDeckPriceCache(d, priceUsd, priceMissingCount)),
    [applyEdit],
  );
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
      const current = deckRef.current;
      if (current) {
        const existingIdx = findMainboardRow(current, trimmed);
        if (existingIdx >= 0) {
          applyEdit((d) => adjustCardQuantity(d, existingIdx, 1));
          return;
        }
      }
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
    saveState: autosave.saveState,
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
    flushSave: autosave.flushSave,
  };
}
