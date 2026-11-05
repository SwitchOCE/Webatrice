import type { ListenerMiddlewareInstance } from '@reduxjs/toolkit';
import { Actions as ServerActions } from '../server/server.actions';
import { Actions } from './game.actions';
import { clearOptimistic } from './optimistic';

import { registerArrowsListeners } from './game.listeners.arrows';
import { registerCardsListeners } from './game.listeners.cards';
import { registerCountersListeners } from './game.listeners.counters';
import { registerPhasesListeners } from './game.listeners.phases';
import { registerPlayersListeners } from './game.listeners.players';
import { registerZonesListeners } from './game.listeners.zones';

export function registerGameListeners(mw: ListenerMiddlewareInstance<unknown>): void {
  for (const actionCreator of [Actions.gameLeft, Actions.gameClosed, Actions.kicked]) {
    mw.startListening({
      actionCreator,
      effect: (action) => {
        clearOptimistic(action.payload.gameId);
      },
    });
  }
  for (const actionCreator of [ServerActions.disconnected, Actions.clearStore]) {
    mw.startListening({
      actionCreator,
      effect: () => {
        clearOptimistic();
      },
    });
  }
  registerZonesListeners(mw);
  registerCardsListeners(mw);
  registerCountersListeners(mw);
  registerArrowsListeners(mw);
  registerPlayersListeners(mw);
  registerPhasesListeners(mw);
}
