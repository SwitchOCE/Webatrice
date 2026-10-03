import { useCallback, useSyncExternalStore } from 'react';

import { TALLY_TYPES, type TallyType } from '../utils/tally';

/**
 * The tally the game overlays on the selection (desktop's local setting
 * `interface/tallyType`, chosen from the player menu's Tally submenu). Per
 * user, kept in localStorage, shared by every seat menu and the overlay.
 *
 * Same singleton + `useSyncExternalStore` pattern as usePhaseTrackPinned.
 * Seam: once the settings framework (parity branch 19) is in the base, this
 * becomes its `usePreference('tallyType')`.
 */
const STORAGE_KEY = 'webatrice.tallyType';

function loadPersisted(): TallyType {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return TALLY_TYPES.find((t) => t === raw) ?? 'none';
  } catch {
    return 'none';
  }
}

let singleton: TallyType = loadPersisted();
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => singleton;

/** The chosen tally and its setter. */
export function useTallyType(): [TallyType, (next: TallyType) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setValue = useCallback((next: TallyType) => {
    if (next === singleton) {
      return;
    }
    singleton = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still holds for this session.
    }
    listeners.forEach((cb) => cb());
  }, []);
  return [value, setValue];
}
