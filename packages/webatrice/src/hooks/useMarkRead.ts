import { markChatSeen, notificationStore } from '@app/services';

export interface MarkRead {
  markRoomRead(id: number): void;
  markGameRead(id: number): void;
  markChatRead(name: string): void;
  markNotificationsRead(): void;
}

const markRead: MarkRead = {
  markRoomRead: (id) => notificationStore.dispatch({ type: 'clear', scope: 'rooms', key: id }),
  markGameRead: (id) => notificationStore.dispatch({ type: 'clear', scope: 'games', key: id }),
  markChatRead: (name) => markChatSeen(name),
  markNotificationsRead: () => notificationStore.dispatch({ type: 'markAllRead' }),
};

export function useMarkRead(): MarkRead {
  return markRead;
}
