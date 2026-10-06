import type { Message } from '@cockatrice/datatrice';
import { formatChatContext } from '@app/dialogs';
import { formatChatHistoryTime } from '@app/utils';
import { Event_RoomSay_RoomMessageType } from '@cockatrice/sockatrice/generated';

// Desktop prefixes chat-history lines (sent on room join) with their server time.
export function historyTimestamp(message: Message): string | undefined {
  if (message.messageType !== Event_RoomSay_RoomMessageType.ChatHistory || !message.timeOf) {
    return undefined;
  }
  return formatChatHistoryTime(Number(message.timeOf));
}

/**
 * The room chat a report attaches (desktop room ChatView::getRecentChatLog).
 * Stored room messages carry the sender in `name` and, for display, a
 * "name: " prefix on `message` (normalizeUserMessage); the log wants the bare text.
 */
export function roomChatContext(messages: Message[] | undefined): string {
  return formatChatContext((messages ?? []).map((m) => {
    const prefix = `${m.name}: `;
    const message = m.name && m.message.startsWith(prefix) ? m.message.slice(prefix.length) : m.message;
    const timestamp = historyTimestamp(m);
    return {
      userName: m.name,
      message: timestamp ? `[${timestamp}] ${message}` : message,
      timeReceived: m.timeReceived,
    };
  }));
}
