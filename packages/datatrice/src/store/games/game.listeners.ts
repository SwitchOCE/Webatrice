import type { ListenerMiddlewareInstance } from '@reduxjs/toolkit';

import { registerArrowsListeners } from './game.listeners.arrows';
import { registerCardsListeners } from './game.listeners.cards';
import { registerCountersListeners } from './game.listeners.counters';
import { registerPhasesListeners } from './game.listeners.phases';
import { registerPlayersListeners } from './game.listeners.players';
import { registerZonesListeners } from './game.listeners.zones';

// Inbound game events are no-op actions in the slice; these listeners turn each into
// primitive actions plus its log line. Every event has exactly one listener, so the
// order of the domains below does not change what any one event dispatches.
export function registerGameListeners(mw: ListenerMiddlewareInstance<unknown>): void {
  registerZonesListeners(mw);
  registerCardsListeners(mw);
  registerCountersListeners(mw);
  registerArrowsListeners(mw);
  registerPlayersListeners(mw);
  registerPhasesListeners(mw);
}
