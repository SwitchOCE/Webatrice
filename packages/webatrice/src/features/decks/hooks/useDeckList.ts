import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';
import type { CommandFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { Response_DeckList, ServerInfo_DeckStorage_TreeItem } from '@cockatrice/sockatrice/generated';
import { useBackendDeckList, useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { emptyCod, parseCod } from '@app/services';
import { onSessionEnd } from '@app/services/session';

import { clearDeckEditorCache, deleteCachedDeck } from '../deckEditorCache';
import { allDeckFolderPaths, decksUnderFolder, listDeckFolder, type DeckFolderView } from '../deckFolders';
import { groupDecksByFormat, summariesEqual, summarizeDeck, type DeckListSection, type DeckSummary } from '../deckSummary';
import type { FlatDeck } from '../deckTree';

const summaryCache: Map<number, DeckSummary> = new Map();
const summaryRequestedCache: Set<number> = new Set();

export function clearDecksListCache(): void {
  summaryCache.clear();
  summaryRequestedCache.clear();
}
onSessionEnd(clearDecksListCache);

function forgetDeck(deckId: number): void {
  deleteCachedDeck(deckId);
  summaryCache.delete(deckId);
  summaryRequestedCache.delete(deckId);
}

const SERVER_UNNAMED_DECK = 'Unnamed deck';

function storedName(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const nameEl = Array.from(doc.documentElement.children).find((el) => el.tagName === 'deckname');
  return nameEl?.textContent || SERVER_UNNAMED_DECK;
}

type PendingUpload =
  | { kind: 'create'; path: string; name: string }
  | { kind: 'move'; path: string; name: string; fromId: number };

export interface UseDeckList {
  isConnected: boolean;
  loading: boolean;
  listError: string | null;
  storageError: string | null;
  dismissStorageError: () => void;
  folder: DeckFolderView;
  decks: FlatDeck[];
  sections: DeckListSection[];
  summaries: ReadonlyMap<number, DeckSummary>;
  folderPaths: string[];
  decksUnder: (path: string) => FlatDeck[];
  deckTotal: number;
  refresh: () => void;
  createDeck: (name: string, format: string) => boolean;
  importDeck: (xml: string, colorIdentity?: string) => boolean;
  deleteDeck: (deck: FlatDeck) => void;
  createFolder: (name: string) => void;
  deleteFolder: (path: string) => void;
  moveDeck: (deck: FlatDeck, targetPath: string) => void;
}

export function useDeckList({ onDeckCreated, folderPath = '' }: {
  onDeckCreated: (deckId: number) => void;
  folderPath?: string;
}): UseDeckList {
  const webClient = useWebClient();
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const [listError, setListError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [summaries, setSummaries] = useState<Map<number, DeckSummary>>(() => new Map(summaryCache));
  const summaryRequestedRef = useRef<Set<number>>(new Set(summaryRequestedCache));

  const pendingMovesRef = useRef<Map<number, { deck: FlatDeck; targetPath: string; awaitingList?: boolean }>>(new Map());

  const clearSummaries = useCallback(() => {
    setListError(null);
    summaryRequestedRef.current = new Set();
    summaryRequestedCache.clear();
    summaryCache.clear();
    clearDeckEditorCache();
    setSummaries(new Map());
  }, []);
  const { backendDecks, isConnected, refresh } = useBackendDeckList({ beforeRequest: clearSummaries });

  useReduxEffect<CommandFailedPayload>(({ payload: { failure } }) => {
    setListError(describeFailure(failure, t('Decks.listError')));
    for (const [id, move] of pendingMovesRef.current) {
      if (move.awaitingList) {
        pendingMovesRef.current.delete(id);
        setStorageError(describeFailure(failure, t('Decks.moveFailed', { name: move.deck.name })));
      }
    }
  }, server.Types.DECK_LIST_FAILED, [describeFailure, t]);

  const root = backendDecks?.root;
  const folder = useMemo(() => listDeckFolder(root, folderPath), [root, folderPath]);
  const folderPaths = useMemo(() => allDeckFolderPaths(root), [root]);
  const deckTotal = useMemo(() => decksUnderFolder(root, '').length, [root]);

  const pendingUploadsRef = useRef<PendingUpload[]>([]);

  useReduxEffect<{ path: string; treeItem: ServerInfo_DeckStorage_TreeItem }>(
    ({ payload: { path, treeItem } }) => {
      const pending = pendingUploadsRef.current;
      const index = pending.findIndex((p) => p.path === path && p.name === treeItem.name);
      if (index < 0) {
        return;
      }
      const [settled] = pending.splice(index, 1);
      if (settled.kind === 'move') {
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

  useReduxEffect<CommandFailedPayload & { path: string }>(
    ({ payload: { path, failure } }) => {
      const pending = pendingUploadsRef.current;
      const index = pending.findIndex((p) => p.path === path);
      if (index < 0) {
        return;
      }
      const [failed] = pending.splice(index, 1);
      const key = failed.kind === 'move' ? 'Decks.moveFailed' : 'Decks.uploadFailed';
      setStorageError(describeFailure(failure, t(key, { name: failed.name })));
    },
    server.Types.DECK_UPLOAD_FAILED,
    [describeFailure, t],
  );

  const upload = (entry: PendingUpload, xml: string, isPublic?: boolean, colorIdentity?: string) => {
    pendingUploadsRef.current.push(entry);
    webClient.request.session.deckUpload(entry.path, 0, xml, isPublic, colorIdentity);
  };

  const createDeck = (name: string, format: string): boolean => {
    if (!isConnected) {
      return false;
    }
    const deckName = name || t('Decks.list.defaultDeckName');
    upload({ kind: 'create', path: folder.path, name: deckName }, emptyCod(deckName, format));
    return true;
  };

  const importDeck = (xml: string, colorIdentity = ''): boolean => {
    if (!isConnected) {
      return false;
    }
    upload({ kind: 'create', path: folder.path, name: storedName(xml) }, xml, undefined, colorIdentity);
    return true;
  };

  const deleteDeck = (deck: FlatDeck) => {
    webClient.request.session.deckDel(deck.id);
    forgetDeck(deck.id);
  };

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
    const awaitingList = deck.colorIdentity === undefined;
    pendingMovesRef.current.set(deck.id, { deck, targetPath, awaitingList });
    if (awaitingList) {
      webClient.request.session.deckList();
    } else {
      webClient.request.session.deckDownload(deck.id);
    }
  };

  useReduxEffect<{ deckList: Response_DeckList }>(({ payload: { deckList } }) => {
    const listed = decksUnderFolder(deckList.root, '');
    for (const [id, move] of pendingMovesRef.current) {
      if (!move.awaitingList) {
        continue;
      }
      const deck = listed.find((entry) => entry.id === id);
      if (!deck) {
        pendingMovesRef.current.delete(id);
        setStorageError(t('Decks.moveFailed', { name: move.deck.name }));
        continue;
      }
      pendingMovesRef.current.set(id, { ...move, deck, awaitingList: false });
      webClient.request.session.deckDownload(id);
    }
  }, server.Types.BACKEND_DECKS, [webClient, t]);

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
      const move = pendingMovesRef.current.get(payload.deckId);
      if (move && !move.awaitingList) {
        pendingMovesRef.current.delete(payload.deckId);
        upload(
          { kind: 'move', path: move.targetPath, name: storedName(payload.deck), fromId: payload.deckId },
          payload.deck,
          move.deck.isPublic,
          move.deck.colorIdentity,
        );
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

  useReduxEffect<CommandFailedPayload & { deckId: number }>(
    ({ payload: { deckId, failure } }) => {
      const move = pendingMovesRef.current.get(deckId);
      if (!move) {
        return;
      }
      pendingMovesRef.current.delete(deckId);
      setStorageError(describeFailure(failure, t('Decks.moveFailed', { name: move.deck.name })));
    },
    server.Types.DECK_DOWNLOAD_FAILED,
    [describeFailure, t],
  );

  const sections = useMemo(() => groupDecksByFormat(folder.decks, summaries), [folder.decks, summaries]);

  return {
    isConnected,
    loading: !backendDecks,
    listError,
    storageError,
    dismissStorageError: () => setStorageError(null),
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
