import { useEffect, useRef } from 'react';
import { useStore } from 'react-redux';

import type { RootState } from '@app/store';

import type { ObservedAction } from './gameEventSound';

export type ActionFeedHandler = (action: ObservedAction, before: RootState, after: RootState) => void;

/**
 * Calls `handler` once per dispatched action with the state either side of it — what the alert
 * hooks need to tell, say, a concede from a ping tick. Built on the `action` slice that backs
 * useReduxEffect; unlike useReduxEffect it starts at mount and never replays an earlier action.
 */
export function useActionFeed(handler: ActionFeedHandler): void {
  const store = useStore<RootState>();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let before = store.getState();
    let lastCount = before.action.count;
    return store.subscribe(() => {
      const after = store.getState();
      const { action } = after;
      if (action.count !== lastCount) {
        lastCount = action.count;
        handlerRef.current(action, before, after);
      }
      before = after;
    });
  }, [store]);
}
