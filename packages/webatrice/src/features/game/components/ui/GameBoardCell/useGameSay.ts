import { useMemo } from 'react';

import { useWebClient } from '@cockatrice/datatrice/react';

import { useGameId } from '../GameIdContext';

/**
 * Sends a message to the game chat (Command_GameSay) for the local seat's Say
 * menu: verbatim, as desktop actSayMessage does (player_actions.cpp:1214-1220).
 * Undefined on any other seat, since desktop gives only the local player a
 * Say menu (player_menu.cpp:50-54).
 */
export function useGameSay(isLocal: boolean): ((message: string) => void) | undefined {
  const gameId = useGameId();
  const webClient = useWebClient();
  return useMemo(() => {
    if (!isLocal || gameId == null) {
      return undefined;
    }
    return (message: string) => webClient.request.game.gameSay(gameId, { message });
  }, [isLocal, gameId, webClient]);
}
