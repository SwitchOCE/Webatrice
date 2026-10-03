import { useSyncExternalStore } from 'react';

/**
 * Desktop's admin safety lock (TabAdmin "Lock functions" / "Unlock functions").
 *
 * While locked, the Administration page disables its server and moderator
 * functions, and desktop also hides the moderator actions of the user context
 * menu (`TabSupervisor::getAdminLocked`, user_context_menu.cpp). Desktop opens
 * the admin tab unlocked, so the lock starts off. It lives outside React so the
 * Administration page and any context menu read one value; it is per page load
 * and never persisted, like desktop's.
 */
let locked = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): boolean {
  return locked;
}

export function setAdminLocked(next: boolean): void {
  if (next === locked) {
    return;
  }
  locked = next;
  listeners.forEach((cb) => cb());
}

/** Reactive read of the lock, for context menus that hide moderator actions while it is on. */
export function useAdminLocked(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Reactive read plus setter, for the Administration page's Lock / Unlock buttons. */
export function useAdminLock(): [boolean, (next: boolean) => void] {
  return [useAdminLocked(), setAdminLocked];
}
