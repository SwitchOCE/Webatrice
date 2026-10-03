import type { Message } from '@cockatrice/datatrice';
import { formatChatContext } from '@app/dialogs';

/**
 * The room chat a report attaches (desktop room ChatView::getRecentChatLog).
 * Stored room messages carry the sender in `name` and, for display, a
 * "name: " prefix on `message` (normalizeUserMessage); the log wants the bare text.
 */
export function roomChatContext(messages: Message[] | undefined): string {
  return formatChatContext((messages ?? []).map((m) => {
    const prefix = `${m.name}: `;
    return {
      userName: m.name,
      message: m.name && m.message.startsWith(prefix) ? m.message.slice(prefix.length) : m.message,
      timeReceived: m.timeReceived,
    };
  }));
}
