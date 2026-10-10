const NO_OP = {
  markRoomRead: (_id: number) => undefined,
  markGameRead: (_id: number) => undefined,
  markChatRead: (_name: string) => undefined,
  markNotificationsRead: () => undefined,
};

export function useMarkRead(): {
  markRoomRead(id: number): void;
  markGameRead(id: number): void;
  markChatRead(name: string): void;
  markNotificationsRead(): void;
  } {
  return NO_OP;
}
