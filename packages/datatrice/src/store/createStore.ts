import {
  configureStore,
  type EnhancedStore,
  type Middleware,
  type Reducer,
  type StoreEnhancer,
} from '@reduxjs/toolkit';

import { freezeMessagesMiddleware } from './freezeMessagesMiddleware';
import { sanitizeDiagnostics } from './sanitizeDiagnostics';
import { listenerMiddleware } from './listenerMiddleware';
import { rootReducer, type RootState } from './rootReducer';
import { registerServerListeners } from './server/server.listeners';
import { registerGameListeners } from './games/game.listeners';
import { registerRoomsListeners } from './rooms/rooms.listeners';

// App bundlers replace this expression, as with freezeMessagesMiddleware.
declare const process: { env: { NODE_ENV?: string } };

// Shared with the renderWithProviders-style test harness so test stores behave
// like the production store. Both dev-only invariant checks are OFF because
// state holds raw protobuf messages at server scale and the O(state)-per-dispatch
// walks froze dev on busy servers — see
// .github/instructions/datatrice.instructions.md#initialization-order.
// The hazard those checks couldn't see anyway — in-place mutation of a stored
// protobuf-es message, which Immer can't draft — is guarded instead by
// freezeMessagesMiddleware (dev-only, O(changed path) via identity-skip).
export const storeMiddlewareOptions = {
  immutableCheck: false as const,
  serializableCheck: false as const,
};

let listenersRegistered = false;
function ensureListenersRegistered(): void {
  // See .github/instructions/datatrice.instructions.md#initialization-order.
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;
  registerServerListeners(listenerMiddleware);
  registerGameListeners(listenerMiddleware);
  registerRoomsListeners(listenerMiddleware);
}

export interface CreateStoreOptions<S = RootState> {
  reducer?: Reducer<S>;
  preloadedState?: Partial<S>;
  additionalMiddleware?: Middleware[];
  enhancers?: StoreEnhancer[];
}

export function createStore<S = RootState>(
  options: CreateStoreOptions<S> = {},
): EnhancedStore<S> {
  ensureListenersRegistered();
  const {
    reducer = rootReducer as unknown as Reducer<S>,
    preloadedState,
    additionalMiddleware = [],
  } = options;

  return configureStore({
    devTools: process.env.NODE_ENV === 'production' ? false : {
      actionSanitizer: sanitizeDiagnostics,
      stateSanitizer: sanitizeDiagnostics,
    },
    reducer,
    preloadedState: preloadedState as Parameters<typeof configureStore>[0]['preloadedState'],
    middleware: (getDefaultMiddleware) => getDefaultMiddleware(storeMiddlewareOptions)
      .prepend(listenerMiddleware.middleware)
      .concat(freezeMessagesMiddleware, ...additionalMiddleware),
  }) as EnhancedStore<S>;
}
