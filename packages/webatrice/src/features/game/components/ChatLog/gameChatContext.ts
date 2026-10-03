import type { GameMessage } from '@cockatrice/datatrice';
import { formatChatContext } from '@app/dialogs';

/**
 * The game chat a report attaches (desktop game ChatView::getRecentChatLog):
 * player chat lines only, since event lines never pass through
 * ChatView::appendMessage with a sender. The sender is the name captured when
 * the line arrived, so a player who has since left keeps their lines.
 */
export function gameChatContext(messages: GameMessage[]): string {
  return formatChatContext(messages
    .filter((m) => m.kind === 'chat')
    .map((m) => ({
      userName: m.senderName ?? '',
      message: m.message,
      timeReceived: m.timeReceived,
    })));
}
