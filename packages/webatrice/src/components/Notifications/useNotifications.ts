import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { RouteEnum } from '@app/types';

import { markChatSeen, notificationStore, type NotificationState, type NotificationTarget } from './notificationStore';
import { selectUnreadCounts, type UnreadCounts } from './unreadCounts';

export function useNotificationState(): NotificationState {
  return useSyncExternalStore(notificationStore.subscribe, notificationStore.getState);
}

export function useUnreadCounts(): UnreadCounts {
  return selectUnreadCounts(useNotificationState());
}

export interface MarkRead {
  markRoomRead(id: number): void;
  markGameRead(id: number): void;
  markChatRead(name: string): void;
  markNotificationsRead(): void;
}

const markRead: MarkRead = {
  markRoomRead: (id) => notificationStore.dispatch({ type: 'clear', scope: 'rooms', key: id }),
  markGameRead: (id) => notificationStore.dispatch({ type: 'clear', scope: 'games', key: id }),
  markChatRead: markChatSeen,
  markNotificationsRead: () => notificationStore.dispatch({ type: 'markAllRead' }),
};

export function useMarkRead(): MarkRead {
  return markRead;
}

export function useNotificationDrawer(): { open: boolean; setOpen: (open: boolean) => void } {
  const open = useSyncExternalStore(notificationStore.subscribe, () => notificationStore.getState().drawerOpen);
  const setOpen = useCallback((next: boolean) => notificationStore.dispatch({ type: 'setDrawer', open: next }), []);
  return useMemo(() => ({ open, setOpen }), [open, setOpen]);
}

export function targetPath(target: NotificationTarget): string {
  switch (target.type) {
    case 'chat':
      return generatePath(RouteEnum.PLAYER, { name: target.userName });
    case 'room':
      return generatePath(RouteEnum.ROOM, { roomId: String(target.roomId) });
    case 'game':
      return generatePath(RouteEnum.GAME, { gameId: String(target.gameId) });
    default:
      return target.path;
  }
}

export function useOpenNotification(): (entry: { id?: number; target: NotificationTarget }) => void {
  const navigate = useNavigate();
  return useCallback(({ id, target }) => {
    if (id != null) {
      notificationStore.dispatch({ type: 'markEntryRead', id });
    }
    notificationStore.dispatch({ type: 'setDrawer', open: false });
    navigate(targetPath(target));
  }, [navigate]);
}
