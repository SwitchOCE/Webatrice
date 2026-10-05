import { useSyncExternalStore } from 'react';
import { server } from '@cockatrice/datatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { useReduxEffect } from './useReduxEffect';

/**
 * Desktop's admin safety lock (TabAdmin "Lock functions" / "Unlock functions").
 *
 * While locked, the Administration page disables its server and moderator
 * functions, and desktop also hides the moderator actions of the user context
 * menu and the in-game moderator powers: Kick from game for a non-host, and
 * talking as a spectator where the game forbids it (`TabSupervisor::getAdminLocked`,
 * user_context_menu.cpp, tab_game.cpp). Desktop opens the admin tab unlocked, so
 * the lock starts off. It lives outside React so the Administration page, the
 * context menus and the game read one value; it resets at session teardown and is never
 * persisted, like desktop's.
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

/** Mounted by AppShell so teardown is observed even when Administration is closed. */
export function useAdminLockSession(): void {
  useReduxEffect<{ status?: { state: WebsocketTypes.StatusEnum } }>(({ type, payload }) => {
    if (type === server.Types.CLEAR_STORE || payload.status?.state === WebsocketTypes.StatusEnum.DISCONNECTED) {
      setAdminLocked(false);
    }
  }, [server.Types.CLEAR_STORE, server.Types.UPDATE_STATUS]);
}
