const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Local-time stamp for a room chat history line, in desktop's
 * `d MMM yyyy HH:mm:ss` format (TabRoom::processRoomSayEvent), e.g.
 * `3 Oct 2026 09:05:07`. Month names are fixed English abbreviations, as Qt's
 * format strings produce them.
 */
export function formatChatHistoryTime(epochMs: number): string {
  const d = new Date(epochMs);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${time}`;
}
