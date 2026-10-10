import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { server } from '@cockatrice/datatrice';
import {
  getRecentDecks,
  recentDeckSnapshot,
  recordRecentDeck,
  subscribeRecentDecks,
  type RecentDeck,
  type RecentDeckSource,
} from '@app/services';
import { useAppSelector } from '@app/store';

export function useRecentDecks(limit?: number): RecentDeck[] {
  const owner = useAppSelector(server.Selectors.getUser)?.name ?? null;
  const all = useSyncExternalStore(subscribeRecentDecks, getRecentDecks);
  return useMemo(() => {
    const mine = owner ? all.filter((deck) => deck.owner === owner) : [];
    return limit == null ? mine : mine.slice(0, limit);
  }, [all, owner, limit]);
}

export function useRecordRecentDeck(deckId: number | null, deck: RecentDeckSource | null | undefined): void {
  const owner = useAppSelector(server.Selectors.getUser)?.name ?? null;
  const snapshot = owner && deckId != null && deck ? recentDeckSnapshot(owner, deckId, deck, 0) : null;
  const key = snapshot ? JSON.stringify(snapshot) : null;
  useEffect(() => {
    if (key) {
      recordRecentDeck({ ...(JSON.parse(key) as RecentDeck), openedAt: Date.now() });
    }
  }, [key]);
}
