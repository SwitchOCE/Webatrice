import { useMemo } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { games } from '@cockatrice/datatrice';
import { stageDeckDocument } from '@app/services';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import { useGameId } from '../GameIdContext';

/**
 * "Open deck in deck editor" for the local seat: opens the deck this player is
 * playing (`ServerInfo_Player.deck_list`) in the deck editor as a new, unsaved
 * draft, or is undefined until a deck is known (and on another player's seat).
 *
 * Mirrors desktop actOpenDeckInDeckEditor (player_actions.cpp:219-222,
 * tab_supervisor.cpp:989-999): no lookup among stored decks, so a deck loaded
 * from a file or the clipboard opens too, and a stored copy edited since the
 * game loaded it cannot stand in for it. The first save stores it as a new
 * deck.
 */
export function useOpenDeckInEditor(playerId: number, isLocal: boolean): (() => void) | undefined {
  const gameId = useGameId();
  const navigate = useNavigate();
  const deckList = useAppSelector((state) =>
    gameId != null ? games.Selectors.getPlayer(state, gameId, playerId)?.deckList : undefined,
  );

  return useMemo(() => {
    if (!isLocal || !deckList) {
      return undefined;
    }
    return () => {
      navigate(generatePath(RouteEnum.DECK_DRAFT, { token: stageDeckDocument(deckList) }));
    };
  }, [isLocal, deckList, navigate]);
}
