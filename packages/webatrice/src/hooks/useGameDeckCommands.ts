import { useMemo } from 'react';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { RequestId } from '@cockatrice/sockatrice/types';

/** Game deck/lobby ports: game views and hooks express intent without accessing the client. */
export function useGameDeckCommands(gameId: number | undefined) {
  const client = useWebClient();
  return useMemo(() => ({
    // A tracked caller passes its request id; the answer and the failure echo it.
    selectDeck: (params: { deckId: number } | { deck: string }, ...correlation: [requestId?: RequestId]) => {
      if (gameId != null) {
        client.request.game.deckSelect(gameId, params, ...correlation);
      }
    },
    readyStart: (params: { ready: boolean; forceStart?: boolean }) => {
      if (gameId != null) {
        client.request.game.readyStart(gameId, params);
      }
    },
    kick: (playerId: number) => {
      if (gameId != null) {
        client.request.game.kickFromGame(gameId, { playerId });
      }
    },
  }), [client, gameId]);
}
