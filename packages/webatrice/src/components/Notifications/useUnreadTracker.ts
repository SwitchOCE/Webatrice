import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { getPreferencesSnapshot, useActionFeed } from '@app/hooks';
import type { RootState } from '@app/store';
import { chatFilterVerdicts, isRoomMessageVisible, visiblePrivateMessages } from '@app/utils';

import { notificationStore } from './notificationStore';
import { currentView, unreadChange, type VisibilityChecks } from './unreadEvents';

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

export function useUnreadTracker(): void {
  const { pathname } = useLocation();
  const view = currentView(pathname);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (view.roomId != null) {
      notificationStore.dispatch({ type: 'clear', scope: 'rooms', key: view.roomId });
    }
    if (view.gameId != null) {
      notificationStore.dispatch({ type: 'clear', scope: 'games', key: view.gameId });
    }
    if (view.chatPeer != null) {
      notificationStore.dispatch({ type: 'clear', scope: 'chats', key: view.chatPeer });
    }
  }, [view.roomId, view.gameId, view.chatPeer]);

  useActionFeed((action, before, after) => {
    const change = unreadChange(action, before, after, viewRef.current, checks);
    if (change) {
      notificationStore.dispatch({ type: change.op, scope: change.scope, key: change.key });
    }
  });
}
