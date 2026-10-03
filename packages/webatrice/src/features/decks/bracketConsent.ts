import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the bracket estimate may ask third-party services for data:
 * Scryfall (the Game Changers list and oracle text) and Commander
 * Spellbook (combos). Off until the user opts in, so opening a deck sends
 * nothing to a third party. Desktop's one online lookup that runs without
 * a click, "Download spoilers automatically", is off by default too
 * (`DownloadSettings::getDownloadSpoilersStatus`); its deck-site
 * integrations each run only from a menu action.
 *
 * Stored per browser in localStorage. This module is the seam for the
 * settings framework: once Settings has an online services group, the
 * preference moves there and these two exports read and write it.
 */
export const BRACKET_LOOKUPS_STORAGE_KEY = 'decks:bracketOnlineLookups';

const listeners = new Set<() => void>();

// The choice for this session when storage is unavailable.
let sessionValue: boolean | undefined;

/** The stored choice; `false` when missing, invalid or storage is unavailable. */
export function readBracketLookupsAllowed(): boolean {
  if (sessionValue !== undefined) {
    return sessionValue;
  }
  try {
    return window.localStorage.getItem(BRACKET_LOOKUPS_STORAGE_KEY) === 'true';
  } catch {
    // Storage disabled — fall through.
  }
  return false;
}

export function writeBracketLookupsAllowed(allowed: boolean): void {
  try {
    window.localStorage.setItem(BRACKET_LOOKUPS_STORAGE_KEY, String(allowed));
    sessionValue = undefined;
  } catch {
    // Storage disabled (private mode, quota, …) — the choice still holds
    // for this session.
    sessionValue = allowed;
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The bracket lookups consent, shared by every open deck view. */
export function useBracketLookupsConsent(): [boolean, (allowed: boolean) => void] {
  const allowed = useSyncExternalStore(subscribe, readBracketLookupsAllowed);
  const setAllowed = useCallback((value: boolean) => writeBracketLookupsAllowed(value), []);
  return [allowed, setAllowed];
}
