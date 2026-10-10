import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useNavigate } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import type { CommandFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useCommandFailureMessage, useReduxEffect, useRequestTracker } from '@app/hooks';
import { lookupCard, parseCod, takeStagedDeck, trackEvent } from '@app/services';
import { useAppSelector } from '@app/store';
import { RouteEnum, type BracketAssessment } from '@app/types';

import {
  deleteDraft,
  getCachedDeck,
  getCachedDraft,
  getDraftDocument,
  setCachedDeck,
  setCachedDraft,
  setDraftDocument,
} from '../deckEditorCache';
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

export interface UseDeckEditor {
  deck: HydratedDeck | null;
  loading: boolean;
  notFound: boolean;
  loadError: string | null;
  saveState: SaveState;
  /** Total (main + commander), excluding sideboard, for the header. */
  totalMainboardCount: number;
  totalSideboardCount: number;

  // --- Mutations (all optimistic; each schedules an autosave) ---
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setFormat: (format: string) => void;
  setBanner: (banner: BannerCandidate | null) => void;
  setTags: (tags: readonly string[]) => void;
  setPriceCache: (priceUsd: number | undefined, priceMissingCount: number | undefined) => void;
  setBracketAssessment: (assessment: BracketAssessment | undefined) => void;
  setPrinting: (index: number, printing: CardPrinting) => void;
  deleteCard: (index: number) => void;
  incQuantity: (index: number, delta: number) => void;
  setCategory: (index: number, category: DeckCard['category']) => void;
  /** Toggle the commander marker on a card. Independent of category.
   *  See DeckCard.isCommander for the full rationale. */
  setCommander: (index: number, isCommander: boolean) => void;
  addCard: (name: string) => Promise<void>;
  flushSave: () => void;
  retrySave: () => void;
  isModified: boolean;
  saveNow: () => Promise<boolean>;
  discardChanges: () => void;
  pauseAutosave: () => void;
  resumeAutosave: () => void;

  history: DeckHistory;
  canUndo: boolean;
  canRedo: boolean;
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
}

export function useDeckEditor(deckId: number | null, draftToken: string | null = null): UseDeckEditor {
  const webClient = useWebClient();
  const navigate = useNavigate();
  const isConnected = useAppSelector(server.Selectors.getIsConnected);

  const isDraft = deckId == null && draftToken != null;
  const initialCached = deckId != null ? getCachedDeck(deckId) : undefined;
  const initialDraft = isDraft ? getCachedDraft(draftToken) : undefined;
  const [deck, setDeck] = useState<HydratedDeck | null>(initialCached?.deck ?? initialDraft ?? null);
  const [loading, setLoading] = useState(!initialCached && !initialDraft);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const requests = useRequestTracker();

  const deckRef = useRef<HydratedDeck | null>(null);
  const readDeck = useCallback(() => deckRef.current, []);

  const onDraftStored = useCallback((storedId: number, signature: string) => {
    if (!isDraft || !deckRef.current) {
      return;
    }
    setCachedDeck(storedId, { deck: deckRef.current, savedSignature: signature });
    deleteDraft(draftToken);
    navigate(generatePath(RouteEnum.DECK, { deckId: String(storedId) }), { replace: true });
  }, [isDraft, draftToken, navigate]);
  const autosave = useDeckAutosave(
    deckId,
    readDeck,
    initialCached?.savedSignature ?? null,
    isDraft ? { key: draftToken, onStored: onDraftStored } : undefined,
  );
  const { scheduleSave, markSaved, resetSaved, savedSignature } = autosave;
  const history = useDeckHistory();
  const { record, clear: clearHistory, undo: undoHistory, redo: redoHistory } = history;

  const identity = deckId ?? draftToken;
  const [seededIdentity, setSeededIdentity] = useState(identity);
  if (seededIdentity !== identity) {
    clearHistory();
    const cached = initialCached?.deck ?? initialDraft;
    setSeededIdentity(identity);
    setDeck(cached ?? null);
    setLoading(!cached);
    setNotFound(false);
    setLoadError(null);
  }

  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  useEffect(() => {
    if (!isDraft) {
      return;
    }
    if (getCachedDraft(draftToken)) {
      setLoading(false);
      setNotFound(false);
      return;
    }
    const cod = getDraftDocument(draftToken) ?? takeStagedDeck(draftToken);
    if (cod == null) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setDraftDocument(draftToken, cod);
    let cancelled = false;
    (async () => {
      try {
        const hydrated = await hydrateDeck(parseCod(cod));
        if (cancelled) {
          return;
        }
        deckRef.current = hydrated;
        setCachedDraft(draftToken, hydrated);
        setDeck(hydrated);
        clearHistory();
        setLoading(false);
      } catch (err) {
        console.error('Failed to parse deck XML', err);
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDraft, draftToken, clearHistory]);

  // --- Load ---
  useEffect(() => {
    requests.cancel();
    if (deckId == null) {
      return;
    }
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
    const requestId = requests.begin();
    requests.track(requestId);
    webClient.request.session.deckDownload(deckId, requestId);
    return requests.cancel;
  }, [isConnected, deckId, webClient, resetSaved, markSaved, savedSignature, requests]);

  useReduxEffect<{ deckId: number; deck: string; requestId?: string }>(
    ({ payload }) => {
      if (payload.deckId !== deckId || !requests.isCurrent(payload.requestId) || !requests.settle(payload.requestId)) {
        return;
      }
      (async () => {
        try {
          const parsed = parseCod(payload.deck);
          const hydrated = await hydrateDeck(parsed);
          if (!requests.isCurrent(payload.requestId)) {
            return;
          }
          requests.cancel();
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
          trackEvent('deck_opened', { format: hydrated.format });
          setCachedDeck(payload.deckId, { deck: hydrated, savedSignature: signature });
          setLoading(false);
          if (needsMigration) {
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

  useEffect(() => {
    if (isDraft && deck) {
      setCachedDraft(draftToken, deck);
      return;
    }
    if (deckId == null || !deck) {
      return;
    }
    const existing = getCachedDeck(deckId);
    setCachedDeck(deckId, {
      deck,
      savedSignature: existing ? existing.savedSignature : savedSignature(),
    });
  }, [deckId, isDraft, draftToken, deck, savedSignature]);

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

  const editCard = useCallback(
    (index: number, edit: (current: HydratedDeck) => HydratedDeck, reason: (card: DeckCard) => DeckHistoryReason) => {
      const card = deckRef.current?.cards[index];
      if (card) {
        applyEdit(edit, reason(card));
      }
    },
    [applyEdit],
  );

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
    isModified: autosave.isModified,
    saveNow: autosave.saveNow,
    discardChanges: autosave.discardChanges,
    pauseAutosave: autosave.pauseAutosave,
    resumeAutosave: autosave.resumeAutosave,
    history: history.history,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo,
    redo,
  };
}
