import type { GameMessage, PlayerEntry } from '@cockatrice/datatrice';
import { formatChatContext } from '@app/dialogs';

/**
 * The game chat a report attaches (desktop game ChatView::getRecentChatLog):
 * player chat lines only, since event lines never pass through
 * ChatView::appendMessage with a sender.
 */
export function gameChatContext(
  messages: GameMessage[],
  players: Record<number, PlayerEntry> | undefined,
): string {
  return formatChatContext(messages
    .filter((m) => m.kind === 'chat')
    .map((m) => ({
      userName: players?.[m.playerId]?.properties.userInfo?.name ?? '',
      message: m.message,
      timeReceived: m.timeReceived,
    })));
}
