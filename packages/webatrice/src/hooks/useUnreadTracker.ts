import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { notificationStore, unreadChange, type CurrentView, type VisibilityChecks } from '@app/services';
import type { RootState } from '@app/store';
import { chatFilterVerdicts, isRoomMessageVisible, visiblePrivateMessages } from '@app/utils';

import { viewedNow } from './chatVisibility';
import { useActionFeed } from './useActionFeed';
import { getPreferencesSnapshot } from './useSettings';

const checks: VisibilityChecks = {
  roomMessage: (roomId: number, state: RootState) => {
    const stored = state.rooms.messages[roomId]?.at(-1);
    if (!stored) {
      return false;
    }
    const prefs = getPreferencesSnapshot();
    const filter = { roomHistory: prefs.roomHistory, ignoreUnregisteredUsers: prefs.ignoreUnregisteredUsers };
    return isRoomMessageVisible(stored, state.rooms.rooms[roomId]?.users ?? {}, filter, chatFilterVerdicts);
  },
  privateMessage: (peer: string, state: RootState) => {
    const selfName = state.server.user?.name ?? null;
    const list = state.server.messages[peer] ?? [];
    const entry = list.at(-1);
    if (!selfName || !entry) {
      return false;
    }
    const conversation = { selfName, peer: state.server.users[peer], peerIsBuddy: Boolean(state.server.buddyList[peer]) };
    return visiblePrivateMessages(list, conversation, getPreferencesSnapshot(), chatFilterVerdicts).includes(entry);
  },
};

function clearViewed(view: CurrentView) {
  if (view.roomId != null) {
    notificationStore.dispatch({ type: 'clear', scope: 'rooms', key: view.roomId });
  }
  if (view.gameId != null) {
    notificationStore.dispatch({ type: 'clear', scope: 'games', key: view.gameId });
  }
  view.chatPeers.forEach((peer) => notificationStore.dispatch({ type: 'clear', scope: 'chats', key: peer }));
}

export function useUnreadTracker(): void {
  const { pathname } = useLocation();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    clearViewed(viewedNow(pathname));
  }, [pathname]);

  useEffect(() => {
    const reconcile = () => clearViewed(viewedNow(pathnameRef.current));
    window.addEventListener('focus', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      window.removeEventListener('focus', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, []);

  useActionFeed((action, before, after) => {
    const change = unreadChange(action, before, after, viewedNow(pathnameRef.current), checks);
    if (change) {
      notificationStore.dispatch({ type: change.op, scope: change.scope, key: change.key });
    }
  });
}
