/** Desktop `ChatView::getRecentChatLog(50)`, as called by the report action. */
export const MAX_CHAT_CONTEXT_MESSAGES = 50;

export interface ChatContextEntry {
  userName: string;
  message: string;
  /** Local wall-clock ms when the message arrived. */
  timeReceived: number;
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Builds the chat log a report attaches, exactly as desktop does: only user
 * messages count (`ChatView::appendMessage` skips system lines, i.e. an empty
 * sender or "Servatrice"), the newest `max` of them are kept, and each becomes
 * `[hh:mm:ss] user: message` stamped with the local arrival time.
 */
export function formatChatContext(entries: ChatContextEntry[], max = MAX_CHAT_CONTEXT_MESSAGES): string {
  const userEntries = entries.filter(
    (entry) => entry.userName !== '' && entry.userName.toLowerCase() !== 'servatrice',
  );
  return userEntries
    .slice(Math.max(0, userEntries.length - max))
    .map((entry) => `[${formatClock(entry.timeReceived)}] ${entry.userName}: ${entry.message}`)
    .join('\n');
}
