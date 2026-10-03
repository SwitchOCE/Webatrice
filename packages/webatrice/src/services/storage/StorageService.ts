import { dexieService, Stores } from '../dexie';

/**
 * Browser-storage status and the targeted clears behind Settings › Storage. Desktop's storage
 * page manages picture caches and file paths; here everything lives in the origin's IndexedDB
 * (and the HTTP cache, which the page cannot reach), so the controls are usage, per-table
 * counts, clearing what can be re-fetched or re-imported, and asking the browser not to evict.
 */

/** Imported card database: everything `LocalOracleImportService` writes. Re-importable. */
export const CARD_DATA_STORES: readonly Stores[] = [Stores.CARDS, Stores.SETS, Stores.TOKENS, Stores.FORMATS, Stores.INFO];

/** Card lookups cached from Scryfall. Refetched on demand. */
export const SCRYFALL_CACHE_STORES: readonly Stores[] = [Stores.SCRYFALL_CACHE];

/** Every table, in the order the Storage page lists them. Settings and hosts are never cleared here. */
export const ALL_STORES: readonly Stores[] = [
  ...CARD_DATA_STORES,
  ...SCRYFALL_CACHE_STORES,
  Stores.HOSTS,
  Stores.SETTINGS,
];

export interface StorageUsage {
  /** Bytes this origin uses, as the browser estimates it. */
  usage: number;
  /** Bytes this origin may use before the browser refuses writes. */
  quota: number;
}

const storageManager = (): StorageManager | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator.storage;

/** The origin's usage and quota, or null where the browser does not report them. */
export async function estimateStorage(): Promise<StorageUsage | null> {
  const estimate = await storageManager()?.estimate?.();
  if (estimate?.usage == null || estimate.quota == null) {
    return null;
  }
  return { usage: estimate.usage, quota: estimate.quota };
}

/** Whether the browser has promised not to evict this origin's data; null if it cannot say. */
export async function isStoragePersisted(): Promise<boolean | null> {
  const manager = storageManager();
  return manager?.persisted ? manager.persisted() : null;
}

/**
 * Asks the browser to keep this origin's data under storage pressure. Browsers may grant it
 * silently, prompt, or refuse (Firefox prompts; Chromium decides from engagement).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const manager = storageManager();
  return manager?.persist ? manager.persist() : false;
}

export function isPersistentStorageSupported(): boolean {
  return typeof storageManager()?.persist === 'function';
}

/** Row count of every table. */
export async function countStoredRecords(): Promise<Record<Stores, number>> {
  const counts = await Promise.all(ALL_STORES.map((store) => dexieService.count(store)));
  return Object.fromEntries(ALL_STORES.map((store, i) => [store, counts[i]])) as Record<Stores, number>;
}

export const clearScryfallCache = (): Promise<void> => dexieService.clear(SCRYFALL_CACHE_STORES);

/** Deletes the imported card database. Settings, shortcuts and known hosts are kept. */
export const clearCardData = (): Promise<void> => dexieService.clear(CARD_DATA_STORES);
