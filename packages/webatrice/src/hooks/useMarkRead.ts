export interface MarkRead {
  markRoomRead(id: number): void;
  markGameRead(id: number): void;
  markChatRead(name: string): void;
  markNotificationsRead(): void;
}

const NOOP: MarkRead = {
  markRoomRead: () => undefined,
  markGameRead: () => undefined,
  markChatRead: () => undefined,
  markNotificationsRead: () => undefined,
};

export function useMarkRead(): MarkRead {
  return NOOP;
}
