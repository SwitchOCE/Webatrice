export interface UnreadCounts {
  rooms: Readonly<Record<number, number>>;
  games: Readonly<Record<number, number>>;
  chats: Readonly<Record<string, number>>;
  notifications: number;
  total: number;
}

const NONE: UnreadCounts = { rooms: {}, games: {}, chats: {}, notifications: 0, total: 0 };

export function useUnreadCounts(): UnreadCounts {
  return NONE;
}
