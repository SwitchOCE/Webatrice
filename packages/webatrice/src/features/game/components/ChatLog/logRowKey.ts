const rowKeys = new WeakMap<object, number>();
let nextRowKey = 0;

/**
 * A key for a game-log line that stays with the line for its whole life. The store trims the
 * oldest lines once the log is full, so an index would move every line one key down and remount
 * the whole list; the log is a live region, and remounted lines would be read out again. The
 * store never copies a line it keeps (Immer shares untouched entries), so the object is the
 * line's identity.
 */
export function logRowKey(message: object): number {
  let key = rowKeys.get(message);
  if (key === undefined) {
    key = nextRowKey++;
    rowKeys.set(message, key);
  }
  return key;
}
