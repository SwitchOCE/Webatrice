import { useCallback, useEffect } from 'react';
import { server } from '@cockatrice/datatrice';

import { useAppDispatch, useAppSelector } from '@app/store';
import type { Tab } from '../topBarTabs';

export function usePrivateChatRegistration(tabs: readonly Tab[]) {
  const dispatch = useAppDispatch();
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const ownName = useAppSelector((state) => server.Selectors.getUser(state)?.name);

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    for (const tab of tabs) {
      if (tab.type === 'player') {
        const userName = tab.key.slice('player:'.length);
        if (userName && userName !== ownName) {
          dispatch(server.Actions.privateChatOpened({ userName }));
        }
      }
    }
  }, [dispatch, isConnected, tabs, ownName]);

  return useCallback((tab: Tab) => {
    if (tab.type === 'player') {
      dispatch(server.Actions.privateChatClosed({ userName: tab.key.slice('player:'.length) }));
    }
  }, [dispatch]);
}
