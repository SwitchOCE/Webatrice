interface MessageLike {
  senderName: string;
  message: string;
  timeReceived: number;
}

export interface ConversationSummary {
  name: string;
  lastText: string;
  lastFromSelf: boolean;
  lastTime: number;
}

export function conversationSummaries(
  conversations: Readonly<Record<string, readonly MessageLike[]>>,
  selfName: string | null,
): ConversationSummary[] {
  return Object.entries(conversations)
    .flatMap(([name, messages]) => {
      const last = messages.at(-1);
      if (!last || name === selfName) {
        return [];
      }
      return [{ name, lastText: last.message, lastFromSelf: last.senderName === selfName, lastTime: last.timeReceived }];
    })
    .sort((a, b) => b.lastTime - a.lastTime || a.name.localeCompare(b.name));
}
