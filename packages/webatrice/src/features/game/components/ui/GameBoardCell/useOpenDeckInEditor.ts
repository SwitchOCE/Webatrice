import { useEffect, useMemo } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { games, server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type {
  ServerInfo_DeckStorage_Folder,
  ServerInfo_DeckStorage_TreeItem,
} from '@cockatrice/sockatrice/generated';
import { parseCod } from '@app/services';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import { useGameId } from '../GameIdContext';

/** Leaf decks of Servatrice's deck tree, in tree order. Folders nest freely. */
export function flattenBackendDecks(
  folder: ServerInfo_DeckStorage_Folder | undefined,
): { id: number; name: string }[] {
  const out: { id: number; name: string }[] = [];
  const walk = (items: ServerInfo_DeckStorage_TreeItem[] | undefined) => {
    for (const item of items ?? []) {
      if (item.file) {
        out.push({ id: item.id, name: item.name });
      } else if (item.folder) {
        walk(item.folder.items);
      }
    }
  };
  walk(folder?.items);
  return out;
}

/**
 * "Open deck in deck editor" for the local seat: navigates to the saved deck
 * whose name matches the game deck's `<deckname>`, or is undefined when there
 * is none (an opponent's seat, a foreign or uploaded deck, or a deck list not
 * yet fetched — fetched here when missing).
 *
 * A webatrice divergence: desktop rebuilds the deck in-app from game state.
 * Matching by name (first match, case- and space-insensitive) covers the
 * common case without hashing every candidate the way desktop's deckHash does
 * (deck_list_node_tree.cpp:73).
 */
export function useOpenDeckInEditor(playerId: number, isLocal: boolean): (() => void) | undefined {
  const gameId = useGameId();
  const webClient = useWebClient();
  const navigate = useNavigate();
  const backendDecks = useAppSelector(server.Selectors.getBackendDecks);
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const deckList = useAppSelector((state) =>
    gameId != null ? games.Selectors.getPlayer(state, gameId, playerId)?.deckList : undefined,
  );

  useEffect(() => {
    if (isLocal && isConnected && !backendDecks) {
      webClient.request.session.deckList();
    }
  }, [isLocal, isConnected, backendDecks, webClient]);

  const gameDeckName = useMemo<string | null>(() => {
    if (!isLocal || !deckList) {
      return null;
    }
    try {
      return parseCod(deckList).name || null;
    } catch {
      return null;
    }
  }, [isLocal, deckList]);

  const deckId = useMemo<number | null>(() => {
    if (!isLocal || !gameDeckName || !backendDecks) {
      return null;
    }
    const target = gameDeckName.trim().toLowerCase();
    const match = flattenBackendDecks(backendDecks.root).find((r) => r.name.trim().toLowerCase() === target);
    return match?.id ?? null;
  }, [isLocal, gameDeckName, backendDecks]);

  return useMemo(() => {
    if (deckId == null) {
      return undefined;
    }
    return () => {
      navigate(generatePath(RouteEnum.DECK, { deckId: String(deckId) }));
    };
  }, [deckId, navigate]);
}
