import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';
import type { CommandFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_DeckStorage_TreeItem } from '@cockatrice/sockatrice/generated';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { emptyCod, parseCod } from '@app/services';
import { useAppSelector } from '@app/store';

import { clearDeckEditorCache, deleteCachedDeck } from '../deckEditorCache';
import { groupDecksByFormat, summariesEqual, summarizeDeck, type DeckListSection, type DeckSummary } from '../deckSummary';
import { flattenDeckTree, type FlatDeck } from '../deckTree';

/**
 * Session caches for the MyDecks list, so navigating away and back
 * doesn't re-download every deck's XML (and flash "Loading…" on every
 * row). Cleared by Refresh and, through `clearDecksListCache`, by the
 * shell when the server / user identity changes — deck ids are per-user
 * on Servatrice.
 */
const summaryCache: Map<number, DeckSummary> = new Map();
const summaryRequestedCache: Set<number> = new Set();

export function clearDecksListCache(): void {
  summaryCache.clear();
  summaryRequestedCache.clear();
}

export interface UseDeckList {
  isConnected: boolean;
  /** True until the deck tree has arrived. */
  loading: boolean;
  /** Why the deck list could not be loaded; null until a request fails and
   *  again once the user retries. */
  listError: string | null;
  /** Every deck file in the storage tree, newest first. */
  decks: FlatDeck[];
  /** `decks` bucketed by format, in display order. */
  sections: DeckListSection[];
  /** Summaries parsed so far; a deck without one is still downloading. */
  summaries: ReadonlyMap<number, DeckSummary>;
  /** Drop every cached summary and editor copy, then re-request the tree. */
  refresh: () => void;
  /** Upload an empty deck at the storage root; `onDeckCreated` fires with its id. */
  createDeck: (name: string, format: string) => void;
  /** Upload `.cod` XML as a new deck at the storage root; opens like a created deck. */
  importDeck: (xml: string) => void;
  deleteDeck: (deck: FlatDeck) => void;
}

/**
 * Data owner for the MyDecks route: the Servatrice deck tree, a summary
 * per deck, and the storage commands (list, upload, delete).
 *
 * Servatrice's tree carries only `{ id, name, creationTime }`, so once the
 * tree arrives every deck is downloaded in parallel and its summary
 * (price, bracket, format, art) is parsed out of the response. Small XMLs
 * over the open socket land in milliseconds, so rows fill in without a
 * visible stutter.
 */
export function useDeckList({ onDeckCreated }: { onDeckCreated: (deckId: number) => void }): UseDeckList {
  const webClient = useWebClient();
  const backendDecks = useAppSelector(server.Selectors.getBackendDecks);
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  // Replaces the loading spinner (which would otherwise spin forever) until
  // the user retries.
  const [listError, setListError] = useState<string | null>(null);

  // Seeded from the session cache so returning to the tab shows known
  // summaries immediately; new summaries flow into both.
  const [summaries, setSummaries] = useState<Map<number, DeckSummary>>(() => new Map(summaryCache));
  const summaryRequestedRef = useRef<Set<number>>(new Set(summaryRequestedCache));

  const refresh = () => {
    if (!isConnected) {
      return;
    }
    setListError(null);
    // A manual refresh re-downloads every deck (picking up edits made
    // since the last visit) and drops the editor's copies too, so a deck
    // reopened after Refresh is fetched fresh.
    summaryRequestedRef.current = new Set();
    summaryRequestedCache.clear();
    summaryCache.clear();
    clearDeckEditorCache();
    setSummaries(new Map());
    webClient.request.session.deckList();
  };

  useReduxEffect<CommandFailedPayload>(({ payload: { failure } }) => {
    setListError(describeFailure(failure, t('Decks.listError')));
  }, server.Types.DECK_LIST_FAILED, [describeFailure, t]);

  useEffect(() => {
    if (isConnected && !backendDecks) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch on connect or when the list is dropped
  }, [isConnected, backendDecks]);

  const decks = useMemo<FlatDeck[]>(() => flattenDeckTree(backendDecks?.root), [backendDecks]);

  // Only a deck *this list* created or imported opens the editor — a
  // background upload (an editor autosave) must not yank the tab away.
  const pendingCreateRef = useRef(false);
  useReduxEffect<{ path: string; treeItem: ServerInfo_DeckStorage_TreeItem }>(
    ({ payload: { treeItem } }) => {
      if (!pendingCreateRef.current) {
        return;
      }
      pendingCreateRef.current = false;
      if (treeItem.id) {
        onDeckCreated(treeItem.id);
      }
    },
    server.Types.DECK_UPLOAD,
    [onDeckCreated],
  );

  const createDeck = (name: string, format: string) => {
    if (!isConnected) {
      return;
    }
    pendingCreateRef.current = true;
    // deckId 0 asks Servatrice for a new id; path "" is the root.
    webClient.request.session.deckUpload('', 0, emptyCod(name || 'New Deck', format));
  };

  const importDeck = (xml: string) => {
    if (!isConnected) {
      return;
    }
    pendingCreateRef.current = true;
    webClient.request.session.deckUpload('', 0, xml);
  };

  const deleteDeck = (deck: FlatDeck) => {
    webClient.request.session.deckDel(deck.id);
    // Evict the editor's copy so a stale entry can't surface if the
    // server later reuses this id for a brand-new deck.
    deleteCachedDeck(deck.id);
    summaryCache.delete(deck.id);
    summaryRequestedCache.delete(deck.id);
  };

  useEffect(() => {
    if (!isConnected || decks.length === 0) {
      return;
    }
    for (const deck of decks) {
      if (summaryRequestedRef.current.has(deck.id)) {
        continue;
      }
      summaryRequestedRef.current.add(deck.id);
      summaryRequestedCache.add(deck.id);
      webClient.request.session.deckDownload(deck.id);
    }
  }, [isConnected, decks, webClient]);

  useReduxEffect<{ deckId: number; deck: string }>(
    ({ payload }) => {
      try {
        const next = summarizeDeck(parseCod(payload.deck));
        summaryCache.set(payload.deckId, next);
        setSummaries((prev) => {
          const existing = prev.get(payload.deckId);
          if (existing && summariesEqual(existing, next)) {
            return prev;
          }
          const out = new Map(prev);
          out.set(payload.deckId, next);
          return out;
        });
      } catch {
        // Malformed XML — leave the row without a summary.
      }
    },
    server.Types.DECK_DOWNLOADED,
    [],
  );

  const sections = useMemo(() => groupDecksByFormat(decks, summaries), [decks, summaries]);

  return {
    isConnected,
    loading: !backendDecks,
    listError,
    decks,
    sections,
    summaries,
    refresh,
    createDeck,
    importDeck,
    deleteDeck,
  };
}
