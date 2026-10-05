import { useCallback, useSyncExternalStore } from 'react';

import { readLocalStorage, writeLocalStorage } from '@app/services';

import { detectTransientTab, isStickyTabType, type Tab, type TabType } from '../topBarTabs';

/**
 * The sticky tabs (see `isStickyTabType`), kept in a module-level store.
 * TopBar is rendered inside each page's Layout, so it remounts on every
 * navigation and a useState would be wiped; this store and
 * `useSyncExternalStore` survive remounts without a provider.
 *
 * Also persisted so tabs survive a reload. Only the plain metadata
 * (key/type/title/titleKey/titleParams/route/closeable) round-trips:
 * no sticky tab carries an `onClose`, since TopBar attaches close
 * behaviour when it builds the strip.
 */
const STICKY_STORAGE_KEY = 'webatrice.stickyTabs';

export type StickyTabsUpdater = (prev: Tab[]) => Tab[];

/** A persisted entry TopBar can still show: every field it needs, of a sticky type. */
export function isValidPersistedTab(t: unknown): t is Tab {
  if (!t || typeof t !== 'object') {
    return false;
  }
  const rec = t as Record<string, unknown>;
  return (
    typeof rec.key === 'string' &&
    (typeof rec.title === 'string' || typeof rec.titleKey === 'string') &&
    typeof rec.route === 'string' &&
    typeof rec.closeable === 'boolean' &&
    typeof rec.type === 'string' &&
    isStickyTabType(rec.type as TabType)
  );
}

/** Earlier builds persisted the translated title of every tab, which would pin
 *  "My Decks" and the like to the language they were saved in. Re-derive such a
 *  tab's title from its route; a deck's real name comes back with deckList. */
function retitleLegacyTab(tab: Tab): Tab {
  if (tab.titleKey !== undefined) {
    return tab;
  }
  const derived = detectTransientTab(tab.route);
  return derived && derived.key === tab.key ? derived : tab;
}

function loadPersistedStickyTabs(): Tab[] {
  const raw = readLocalStorage(STICKY_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isValidPersistedTab).map(retitleLegacyTab) : [];
  } catch {
    return [];
  }
}

function persistStickyTabs(tabs: Tab[]): void {
  // Strip onClose (functions don't survive JSON) before writing.
  const serializable = tabs.map(({ key, type, title, titleKey, titleParams, route, closeable }) => ({
    key, type, title, titleKey, titleParams, route, closeable,
  }));
  writeLocalStorage(STICKY_STORAGE_KEY, JSON.stringify(serializable));
}

let stickyTabs: Tab[] = loadPersistedStickyTabs();
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Tab[] {
  return stickyTabs;
}

/**
 * The sticky tabs and their updater. An updater that returns the same array is
 * a no-op: nothing is written and no subscriber re-renders.
 */
export function useStickyTabs(): [Tab[], (updater: StickyTabsUpdater) => void] {
  const tabs = useSyncExternalStore(subscribe, getSnapshot);
  const update = useCallback((updater: StickyTabsUpdater) => {
    const next = updater(stickyTabs);
    if (next === stickyTabs) {
      return;
    }
    stickyTabs = next;
    persistStickyTabs(next);
    listeners.forEach((cb) => cb());
  }, []);
  return [tabs, update];
}
