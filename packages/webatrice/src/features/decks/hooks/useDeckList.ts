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
import { allDeckFolderPaths, decksUnderFolder, listDeckFolder, type DeckFolderView } from '../deckFolders';
import { groupDecksByFormat, summariesEqual, summarizeDeck, type DeckListSection, type DeckSummary } from '../deckSummary';
import type { FlatDeck } from '../deckTree';

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

/** Forget everything cached about a deck that left storage. */
function forgetDeck(deckId: number): void {
  // Evict the editor's copy so a stale entry can't surface if the server
  // later reuses this id for a brand-new deck.
  deleteCachedDeck(deckId);
  summaryCache.delete(deckId);
  summaryRequestedCache.delete(deckId);
}

/**
 * An upload waiting for Servatrice's answer. Answers carry the folder and
 * the deck's name, which pick the waiting entry; a `move` deletes the
 * original once its copy exists.
 */
type PendingUpload =
  | { kind: 'create'; path: string; name: string }
  | { kind: 'move'; path: string; name: string; fromId: number };

export interface UseDeckList {
  isConnected: boolean;
  /** True until the deck tree has arrived. */
  loading: boolean;
  /** Why the deck list could not be loaded; null until a request fails and
   *  again once the user retries. */
  listError: string | null;
  /** The folder shown: its subfolders and its own decks. */
  folder: DeckFolderView;
  /** The shown folder's decks, newest first. */
  decks: FlatDeck[];
  /** `decks` bucketed by format, in display order. */
  sections: DeckListSection[];
  /** Summaries parsed so far; a deck without one is still downloading. */
  summaries: ReadonlyMap<number, DeckSummary>;
  /** Every folder path, root first — where a deck can be moved. */
  folderPaths: string[];
  /** Every deck at or below a folder. */
  decksUnder: (path: string) => FlatDeck[];
  /** Decks in the whole storage tree. */
  deckTotal: number;
  /** Drop every cached summary and editor copy, then re-request the tree. */
  refresh: () => void;
  /** Upload an empty deck into the shown folder; `onDeckCreated` fires with its id.
   *  False (nothing sent) while disconnected. */
  createDeck: (name: string, format: string) => boolean;
  /** Upload `.cod` XML as a new deck into the shown folder; opens like a created deck.
   *  False (nothing sent) while disconnected. */
  importDeck: (xml: string) => boolean;
  deleteDeck: (deck: FlatDeck) => void;
  /** Create a subfolder of the shown folder (`name` already checked). */
  createFolder: (name: string) => void;
  /** Delete a folder with everything in it. */
  deleteFolder: (path: string) => void;
  /** Move a deck to another folder: copy it there, then delete the original. */
  moveDeck: (deck: FlatDeck, targetPath: string) => void;
}

/**
 * Data owner for the MyDecks route: the Servatrice deck tree, a summary
 * per shown deck, and the storage commands desktop's `TabDeckStorage`
 * offers on the server side (upload into a folder, new folder, delete deck
 * or folder), plus moving a deck between folders.
 *
 * Servatrice's tree carries only `{ id, name, creationTime }`, so every
 * deck in the shown folder is downloaded and its summary (price, bracket,
 * format, art, tags) parsed out of the response.
 */
export function useDeckList({ onDeckCreated, folderPath = '' }: {
  onDeckCreated: (deckId: number) => void;
  folderPath?: string;
}): UseDeckList {
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

  const root = backendDecks?.root;
  const folder = useMemo(() => listDeckFolder(root, folderPath), [root, folderPath]);
  const folderPaths = useMemo(() => allDeckFolderPaths(root), [root]);
  const deckTotal = useMemo(() => decksUnderFolder(root, '').length, [root]);

  // --- Uploads (create, import, move) ---
  // Only a deck *this list* created or imported opens the editor.
  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  // Decks being moved, by id, waiting for their XML: id → target folder.
  const pendingMovesRef = useRef<Map<number, string>>(new Map());

  useReduxEffect<{ path: string; treeItem: ServerInfo_DeckStorage_TreeItem }>(
    ({ payload: { path, treeItem } }) => {
      const pending = pendingUploadsRef.current;
      const index = pending.findIndex((p) => p.path === path && p.name === treeItem.name);
      const settled = pending.splice(index >= 0 ? index : 0, 1)[0];
      if (!settled) {
        return;
      }
      if (settled.kind === 'move') {
        // The copy exists: carry the summary over, then drop the original.
        const summary = summaryCache.get(settled.fromId);
        if (summary && treeItem.id) {
          summaryCache.set(treeItem.id, summary);
          summaryRequestedCache.add(treeItem.id);
          summaryRequestedRef.current.add(treeItem.id);
          setSummaries((prev) => new Map(prev).set(treeItem.id, summary));
        }
        webClient.request.session.deckDel(settled.fromId);
        forgetDeck(settled.fromId);
      } else if (treeItem.id) {
        onDeckCreated(treeItem.id);
      }
    },
    server.Types.DECK_UPLOAD,
    [onDeckCreated, webClient],
  );

  const upload = (entry: PendingUpload, xml: string) => {
    pendingUploadsRef.current.push(entry);
    webClient.request.session.deckUpload(entry.path, 0, xml);
  };

  /** The name Servatrice will store (`cmdDeckUpload` falls back to "Unnamed deck"). */
  const storedName = (xml: string) => {
    try {
      return parseCod(xml).name;
    } catch {
      return '';
    }
  };

  const createDeck = (name: string, format: string): boolean => {
    if (!isConnected) {
      return false;
    }
    const deckName = name || 'New Deck';
    // deckId 0 asks Servatrice for a new id.
    upload({ kind: 'create', path: folder.path, name: deckName }, emptyCod(deckName, format));
    return true;
  };

  const importDeck = (xml: string): boolean => {
    if (!isConnected) {
      return false;
    }
    upload({ kind: 'create', path: folder.path, name: storedName(xml) }, xml);
    return true;
  };

  const deleteDeck = (deck: FlatDeck) => {
    webClient.request.session.deckDel(deck.id);
    forgetDeck(deck.id);
  };

  // --- Folders ---
  const createFolder = (name: string) => {
    if (!isConnected) {
      return;
    }
    webClient.request.session.deckNewDir(folder.path, name);
  };

  const deleteFolder = (path: string) => {
    if (!isConnected || !path) {
      return;
    }
    for (const deck of decksUnderFolder(root, path)) {
      forgetDeck(deck.id);
    }
    webClient.request.session.deckDelDir(path);
  };

  const moveDeck = (deck: FlatDeck, targetPath: string) => {
    if (!isConnected || targetPath === deck.path) {
      return;
    }
    pendingMovesRef.current.set(deck.id, targetPath);
    webClient.request.session.deckDownload(deck.id);
  };

  // --- Summaries (and the XML a move needs) ---
  useEffect(() => {
    if (!isConnected || folder.decks.length === 0) {
      return;
    }
    for (const deck of folder.decks) {
      if (summaryRequestedRef.current.has(deck.id)) {
        continue;
      }
      summaryRequestedRef.current.add(deck.id);
      summaryRequestedCache.add(deck.id);
      webClient.request.session.deckDownload(deck.id);
    }
  }, [isConnected, folder.decks, webClient]);

  useReduxEffect<{ deckId: number; deck: string }>(
    ({ payload }) => {
      const moveTarget = pendingMovesRef.current.get(payload.deckId);
      if (moveTarget !== undefined) {
        pendingMovesRef.current.delete(payload.deckId);
        upload({ kind: 'move', path: moveTarget, name: storedName(payload.deck), fromId: payload.deckId }, payload.deck);
      }
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

  const sections = useMemo(() => groupDecksByFormat(folder.decks, summaries), [folder.decks, summaries]);

  return {
    isConnected,
    loading: !backendDecks,
    listError,
    folder,
    decks: folder.decks,
    sections,
    summaries,
    folderPaths,
    decksUnder: (path: string) => decksUnderFolder(root, path),
    deckTotal,
    refresh,
    createDeck,
    importDeck,
    deleteDeck,
    createFolder,
    deleteFolder,
    moveDeck,
  };
}
