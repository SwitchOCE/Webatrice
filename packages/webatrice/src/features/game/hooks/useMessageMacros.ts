import { useSyncExternalStore } from 'react';

/**
 * The user's message macros (desktop's Settings > Messages, `messages/macro*`),
 * in order: the player menu's Say submenu and the Alt+1…Alt+0 shortcuts send
 * them verbatim.
 *
 * Seam: every reader (the Say menu, the Alt+digit shortcuts) goes through
 * this one hook. The settings framework (parity branch 19) owns the preference
 * and its editor (Settings > Chat), as `useMessageMacros()` in `@app/hooks`
 * with this signature. Until that branch is in the base this reads the list
 * from localStorage (`webatrice.messageMacros`, a JSON string array) and there
 * is no editor. On the restack this file becomes
 * `export { useMessageMacros } from '@app/hooks';`.
 */
const STORAGE_KEY = 'webatrice.messageMacros';
const NONE: readonly string[] = [];

let cachedRaw: string | null = null;
let cached: readonly string[] = NONE;

function read(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return NONE;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      cached = Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === 'string' && m.length > 0) : NONE;
    } catch {
      cached = NONE;
    }
  }
  return cached;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
}

export function useMessageMacros(): readonly string[] {
  return useSyncExternalStore(subscribe, read, () => NONE);
}
