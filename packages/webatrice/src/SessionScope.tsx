import { Fragment, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useStore } from 'react-redux';
import { server } from '@cockatrice/datatrice';
import { useAppSelector, type RootState } from '@app/store';
import { endSession } from '@app/services/session';

/**
 * One boundary per app, inside the store and router. Put session-owned providers
 * and routes below it. The router stays mounted so navigation survives login.
 * Module cleanup runs synchronously on the epoch dispatch, before remounted
 * children read caches or start work. StrictMode effect replay is not a logout.
 */
export function SessionScope({ children }: { children: ReactNode }) {
  const store = useStore<RootState>();
  const epoch = useAppSelector(server.Selectors.selectSessionEpoch);
  const previousEpoch = useRef(epoch);
  useLayoutEffect(() => {
    const check = () => {
      const next = server.Selectors.selectSessionEpoch(store.getState());
      if (next !== previousEpoch.current) {
        previousEpoch.current = next;
        endSession();
      }
    };
    const unsubscribe = store.subscribe(check);
    check();
    return unsubscribe;
  }, [store]);
  return <Fragment key={epoch}>{children}</Fragment>;
}
