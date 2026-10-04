import { readLocalStorage, writeLocalStorage } from './localStorage';

/**
 * The route to reopen after a reload. MemoryRouter has no URL to lean on across refreshes, so the
 * page chrome mirrors the current pathname here and AppShell hands it back to
 * `<MemoryRouter initialEntries={[…]}>` at boot.
 */
const LAST_ROUTE_STORAGE_KEY = 'webatrice.lastRoute';

export function persistLastRoute(pathname: string): void {
  writeLocalStorage(LAST_ROUTE_STORAGE_KEY, pathname);
}

export function loadPersistedLastRoute(): string | null {
  return readLocalStorage(LAST_ROUTE_STORAGE_KEY);
}
