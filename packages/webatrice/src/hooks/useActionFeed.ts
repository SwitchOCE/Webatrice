import { useEffect, useRef } from 'react';
import { useStore } from 'react-redux';
import { listenerMiddleware } from '@cockatrice/datatrice';

import type { RootState } from '@app/store';

interface ObservedAction {
  type: string | null;
  payload: unknown;
}

export type ActionFeedHandler = (action: ObservedAction, before: RootState, after: RootState) => void;

/**
 * Calls `handler` once per dispatched action with the state either side of it — what the alert
 * hooks need to tell, say, a concede from a ping tick. Uses Datatrice's ingress listener
 * middleware, like roomSayReceived, so verdicts settle synchronously during dispatch.
 * Starts at mount and never replays an earlier action.
 */
export function useActionFeed(handler: ActionFeedHandler): void {
  const store = useStore<RootState>();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => listenerMiddleware.startListening({
    predicate: () => true,
    effect: (action, api) => {
      // The middleware instance is shared; only observe this provider's store.
      if (api.getState !== store.getState) {
        return;
      }
      handlerRef.current(
        { type: action.type, payload: action.payload },
        api.getOriginalState() as RootState,
        api.getState() as RootState,
      );
    },
  }), [store]);
}
