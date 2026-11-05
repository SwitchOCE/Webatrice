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
      dispatch(games.Actions.counterValueUpdated({
        gameId,
        playerId,
        data: create(Event_SetCounterSchema, { counterId, value }),
      }));
    const currentCount = (counterId: number) =>
      store.getState().games.games[gameId]?.players[playerId]?.counters[counterId]?.count ?? 0;

    return {
      increment: (counterId, delta) => {
        const key = games.counterOpKey(gameId, playerId, counterId);
        const token = games.beginOptimisticValue(
          key, currentCount(counterId), value => value + delta, value => applyCounter(counterId, value),
        );
        game.incCounter(gameId, { counterId, delta }, {
          onSuccess: () => games.rollbackOptimistic(token),
          onError: (code) => {
            console.warn(`incCounter rejected (${code}); rolling back counter ${counterId}`);
            games.rollbackOptimistic(token);
          },
        });
      },
      set: (counterId, value) => {
        const key = games.counterOpKey(gameId, playerId, counterId);
        const token = games.beginOptimisticValue(
          key, currentCount(counterId), () => value, value => applyCounter(counterId, value),
        );
        game.setCounter(gameId, { counterId, value }, {
          onSuccess: () => games.rollbackOptimistic(token),
          onError: (code) => {
            console.warn(`setCounter rejected (${code}); rolling back counter ${counterId}`);
            games.rollbackOptimistic(token);
          },
        });
      },
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
      flipCoin: () => {
        game.rollDie(gameId, { sides: 2, count: 1 });
      },
    };
  }, [gameId, webClient, dispatch, store, playerId]);
}
