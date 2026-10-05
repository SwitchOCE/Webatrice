import { useMemo } from 'react';
import { useWebClient } from '@cockatrice/datatrice/react';

/** Game deck/lobby ports: game views and hooks express intent without accessing the client. */
export function useGameDeckCommands(gameId: number | undefined) {
  const client = useWebClient();
  return useMemo(() => ({
    selectDeck: (params: { deckId: number } | { deck: string }) => {
      if (gameId != null) {
        client.request.game.deckSelect(gameId, params);
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
