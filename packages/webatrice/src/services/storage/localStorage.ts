/**
 * `window.localStorage` for small UI state (tab layout, last route) that must be readable
 * synchronously at boot. Neither call throws: storage can be missing (no window), disabled, full
 * or blocked in private mode, and then the state simply does not persist.
 */

/** The stored string, or null when nothing is stored or storage is unavailable. */
export function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores `value`; a failed write is dropped. */
export function writeLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota, private mode or disabled storage: nothing persists this session.
  }
}
