import { useMemo } from 'react';
import { games } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { useAppDispatch } from '@app/store';

import { useGameId } from '../GameIdContext';
import type {
  PlayerZoneCommands,
  RevealRecipient,
  RevealSelection,
  SeatMoveCard,
  SeatMoveDestination,
} from '../PlayerBoard/playerBoard.types';
import { useMoveCard } from './useMoveCard';

// Desktop's random-card sentinel for Command_RevealCards.card_id (player_actions.h:42).
const RANDOM_CARD_FROM_ZONE = -2;

/**
 * Zone commands for one seat: moves, library management, dumps and reveals.
 * Undefined until the game id is known.
 *
 * `move` sends through useMoveCard, the one optimistic command path shared
 * with the game's drag coordinator.
 */
export function usePlayerZoneCommands(playerId: number): PlayerZoneCommands | undefined {
  const gameId = useGameId();
  const webClient = useWebClient();
  const dispatch = useAppDispatch();
  const moveCard = useMoveCard(gameId);

  return useMemo(() => {
    if (gameId == null || !moveCard) {
      return undefined;
    }
    const game = webClient.request.game;

    // Command_RevealCards. "All players" OMITS player_id: Servatrice checks
    // has_player_id() (server_abstract_player.cpp:1476) and treats an explicit
    // -1 as an unknown player. Random uses the single -2 card id
    // (server_abstract_player.cpp:1498-1508); top-N sends top_cards plus the
    // `card_id: [0]` desktop keeps for old servers (player_actions.cpp:1745).
    const reveal = (zoneName: string, to: RevealRecipient, cards: RevealSelection = 'zone') => {
      const params: { zoneName: string; topCards?: number; cardId?: number[]; playerId?: number } = { zoneName };
      if (cards === 'random') {
        params.cardId = [RANDOM_CARD_FROM_ZONE];
      } else if (cards !== 'zone') {
        params.topCards = cards.top;
        params.cardId = [0];
      }
      if (to !== 'all') {
        params.playerId = to;
      }
      game.revealCards(gameId, params);
    };

    const clearView = (zoneName: string) => {
      dispatch(games.Actions.zoneViewCleared({ gameId, playerId, zoneName }));
    };

    // Command_MoveCard between two of this player's zones. `x = -1` appends
    // (desktop's "bottom" / "any free column"); is_reversed is sent only when
    // the caller asks, as the menus always have.
    const moveCards = (from: string, cards: readonly SeatMoveCard[], to: SeatMoveDestination) => {
      moveCard({
        startPlayerId: playerId,
        startZone: from,
        cardsToMove: {
          card: cards.map((c) => (typeof c === 'number' ? { cardId: c } : { cardId: c.id, faceDown: true })),
        },
        targetPlayerId: playerId,
        targetZone: to.zone,
        x: to.index === 'end' ? -1 : (to.index ?? 0),
        y: to.row ?? 0,
        ...(to.reversed !== undefined && { isReversed: to.reversed }),
      });
    };

    return {
      move: moveCard,
      moveCards,
      draw: (count) => game.drawCards(gameId, { number: count }),
      // Command_UndoDraw has no payload (player_actions.cpp:371-374).
      undoDraw: () => game.undoDraw(gameId),
      mulligan: (handSize) => game.mulligan(gameId, { number: handSize }),
      // Inclusive positions; negative counts from the bottom
      // (player_actions.cpp:267-268, 298-299).
      shuffleLibrary: (range = { start: 0, end: -1 }) =>
        game.shuffle(gameId, { zoneName: ZoneName.DECK, start: range.start, end: range.end }),
      // Response_DumpZone lands in `revealedCards`; desktop actViewTopCards /
      // actViewBottomCards (player_actions.cpp:182-197).
      viewLibrary: (count, fromBottom) =>
        game.dumpZone(gameId, { playerId, zoneName: ZoneName.DECK, numberCards: count, isReversed: fromBottom }),
      // Re-opening re-dumps fresh, like desktop's zoneViewCleared on close.
      closeLibraryView: () => clearView(ZoneName.DECK),
      // The sideboard is a HiddenZone too; -1 dumps all of it.
      viewSideboard: () =>
        game.dumpZone(gameId, { playerId, zoneName: ZoneName.SIDEBOARD, numberCards: -1, isReversed: false }),
      closeSideboardView: () => clearView(ZoneName.SIDEBOARD),
      reveal,
      // grant_write_access adds the target to the zone's write set
      // (server_abstract_player.cpp:1566) until the next shuffle; desktop
      // actLendLibrary (player_actions.cpp:1723-1733).
      lendLibrary: (to) =>
        game.revealCards(gameId, { zoneName: ZoneName.DECK, playerId: to, grantWriteAccess: true }),
      // Desktop actAlwaysReveal / actAlwaysLookAt (player_actions.cpp:199-215).
      setAlwaysRevealTopCard: (value) =>
        game.changeZoneProperties(gameId, { zoneName: ZoneName.DECK, alwaysRevealTopCard: value }),
      setAlwaysLookAtTopCard: (value) =>
        game.changeZoneProperties(gameId, { zoneName: ZoneName.DECK, alwaysLookAtTopCard: value }),
    };
  }, [gameId, webClient, dispatch, moveCard, playerId]);
}
