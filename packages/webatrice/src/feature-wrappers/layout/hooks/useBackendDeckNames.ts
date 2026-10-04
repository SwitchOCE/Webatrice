import { useEffect, useMemo } from 'react';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useAppSelector } from '@app/store';

import { flattenDeckNames } from '../topBarTabs';

/**
 * `{deckId → name}` for the user's server decks, so a deck tab can show its
 * name instead of `Deck #N`.
 *
 * Asks for the deck list as soon as the client is connected and has none.
 * Otherwise a reload straight into `/deck/:id` would never send deckList
 * (the Decks page owns that request) and the tab would keep its fallback title.
 */
// TODO(R3): use the shared `hooks/useBackendDeckList.ts` (aud2 D6) once R3 lands.
export function useBackendDeckNames(): ReadonlyMap<number, string> {
  const webClient = useWebClient();
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const backendDecks = useAppSelector(server.Selectors.getBackendDecks);

  useEffect(() => {
    if (isConnected && !backendDecks) {
      webClient.request.session.deckList();
    }
  }, [isConnected, backendDecks, webClient]);

  return useMemo(() => flattenDeckNames(backendDecks), [backendDecks]);
}
