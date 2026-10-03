import { useMemo } from 'react';
import { useStore } from 'react-redux';
import { create } from '@bufbuild/protobuf';

import { games } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { Event_SetCounterSchema } from '@cockatrice/sockatrice/generated';
import { useAppDispatch, type RootState } from '@app/store';

import { useGameId } from '../GameIdContext';
import type { PlayerCounterCommands } from '../PlayerBoard/playerBoard.types';

/**
 * Player counters (life, mana), per-card counters on this seat's battlefield,
 * and the coin flip. Undefined until the game id is known.
 *
 * Player counters are optimistic: the value is applied in Datatrice first
 * (counterSet is a field assignment, so the echo re-applies the same value)
 * and restored if the server rejects.
 */
export function usePlayerCounterCommands(playerId: number): PlayerCounterCommands | undefined {
  const gameId = useGameId();
  const webClient = useWebClient();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  return useMemo(() => {
    if (gameId == null) {
      return undefined;
    }
    const game = webClient.request.game;
    const applyCounter = (counterId: number, value: number) =>
      dispatch(games.Actions.counterSet({
        gameId,
        playerId,
        data: create(Event_SetCounterSchema, { counterId, value }),
      }));
    const currentCount = (counterId: number) =>
      store.getState().games.games[gameId]?.players[playerId]?.counters[counterId]?.count ?? 0;

    return {
      increment: (counterId, delta) => {
        const previousValue = currentCount(counterId);
        applyCounter(counterId, previousValue + delta);
        game.incCounter(gameId, { counterId, delta }, {
          onError: (code) => {
            console.warn(`incCounter rejected (${code}); rolling back counter ${counterId} to ${previousValue}`);
            applyCounter(counterId, previousValue);
          },
        });
      },
      // The server clamps to [0, MAX_COUNTER_VALUE], so raw sums are fine.
      set: (counterId, value) => {
        const previousValue = currentCount(counterId);
        applyCounter(counterId, value);
        game.setCounter(gameId, { counterId, value }, {
          onError: (code) => {
            console.warn(`setCounter rejected (${code}); rolling back counter ${counterId} to ${previousValue}`);
            applyCounter(counterId, previousValue);
          },
        });
      },
      // One command container for the whole batch, like desktop's
      // actIncrementAllCardCounters (player_actions.cpp:1618-1620).
      setCardCounters: (entries) => {
        if (entries.length === 0) {
          return;
        }
        game.bulkSetCardCounterEntries(
          gameId,
          entries.map((e) => ({
            ownerPlayerId: playerId,
            zone: ZoneName.TABLE,
            cardId: e.cardId,
            counterId: e.counterId,
            counterValue: e.value,
          })),
        );
      },
      // Desktop models a coin flip as a d2 (player_actions.cpp:866-872).
      flipCoin: () => {
        game.rollDie(gameId, { sides: 2, count: 1 });
      },
    };
  }, [gameId, webClient, dispatch, store, playerId]);
}
