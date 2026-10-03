import { useMemo } from 'react';
import { useStore } from 'react-redux';
import { create } from '@bufbuild/protobuf';

import { games } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { Event_SetCounterSchema, type ServerInfo_CardCounter } from '@cockatrice/sockatrice/generated';
import { useAppDispatch, type RootState } from '@app/store';

import { useGameId } from '../GameIdContext';
import type { PlayerCounterCommands } from '../PlayerBoard/playerBoard.types';

/**
 * Player counters (life, mana), per-card counters on this seat's battlefield,
 * and the coin flip. Undefined until the game id is known.
 *
 * Player and single card counters are optimistic: the value is applied in
 * Datatrice first (counterSet and cardFieldsUpdated are field assignments, so
 * the echo re-applies the same value) and restored if the server rejects.
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
      // Desktop's add/remove card counter both read the value, adjust it, and
      // send the absolute result. Zero drops the entry, like the listener.
      setCardCounter: (cardId, counterId, value) => {
        const clamped = Math.max(0, value);
        const previousList =
          games.Selectors.getZone(store.getState(), gameId, playerId, ZoneName.TABLE)?.byId[cardId]?.counterList ?? [];
        let nextList: ServerInfo_CardCounter[];
        if (clamped <= 0) {
          nextList = previousList.filter((c) => c.id !== counterId);
        } else if (previousList.some((c) => c.id === counterId)) {
          nextList = previousList.map((c) => (c.id === counterId ? { ...c, value: clamped } : c));
        } else {
          // The reducer only reads { id, value }; the listener builds new entries the same way.
          nextList = [...previousList, { $typeName: 'ServerInfo_CardCounter', id: counterId, value: clamped }];
        }
        const patchCounters = (counterList: ServerInfo_CardCounter[]) =>
          dispatch(games.Actions.cardFieldsUpdated({
            gameId,
            playerId,
            zoneName: ZoneName.TABLE,
            cardId,
            fields: { counterList },
          }));
        patchCounters(nextList);
        game.setCardCounter(
          gameId,
          { zone: ZoneName.TABLE, cardId, counterId, counterValue: clamped },
          undefined,
          {
            onError: (code) => {
              console.warn(`setCardCounter rejected (${code}); rolling back cardId ${cardId} counter ${counterId}`);
              patchCounters(previousList);
            },
          },
        );
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
