import type { Message } from '@cockatrice/datatrice';
import { formatChatContext } from '@app/dialogs';
import { formatChatHistoryTime } from '@app/utils';
import { Event_RoomSay_RoomMessageType } from '@cockatrice/sockatrice/generated';

export function historyTimestamp(message: Message): string | undefined {
  if (message.messageType !== Event_RoomSay_RoomMessageType.ChatHistory || !message.timeOf) {
    return undefined;
  }
  return formatChatHistoryTime(Number(message.timeOf));
}

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
