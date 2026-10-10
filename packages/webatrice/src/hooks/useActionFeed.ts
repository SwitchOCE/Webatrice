import { useEffect, useRef } from 'react';
import { useStore } from 'react-redux';
import { listenerMiddleware } from '@cockatrice/datatrice';

import type { RootState } from '@app/store';

interface ObservedAction {
  type: string | null;
  payload: unknown;
}

export type ActionFeedHandler = (action: ObservedAction, before: RootState, after: RootState) => void;

export function useActionFeed(handler: ActionFeedHandler): void {
  const store = useStore<RootState>();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => listenerMiddleware.startListening({
    predicate: () => true,
    effect: (action, api) => {
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
