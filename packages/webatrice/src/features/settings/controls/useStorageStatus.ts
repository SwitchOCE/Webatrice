import { useSyncExternalStore } from 'react';

import {
  countStoredRecords,
  estimateStorage,
  isStoragePersisted,
  type StorageUsage,
  type Stores,
} from '@app/services';

export interface StorageStatus {
  /** False until the first read finishes. */
  loaded: boolean;
  usage: StorageUsage | null;
  counts: Partial<Record<Stores, number>>;
  persisted: boolean | null;
}

const INITIAL: StorageStatus = { loaded: false, usage: null, counts: {}, persisted: null };

let status: StorageStatus = INITIAL;
/** Bumped by every read, so a slower earlier read (the mount-time one) cannot land last. */
let generation = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) {
    void refreshStorageStatus();
  }
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Re-reads usage, table counts and persistence. The Storage page's controls share one status,
 * so a clear made by one control updates the figures shown by the others. Each call starts a
 * fresh read, since one already in flight may predate the change the caller just made.
 */
export function refreshStorageStatus(): Promise<void> {
  const read = ++generation;
  const apply = (next: StorageStatus) => {
    if (read === generation) {
      status = next;
      listeners.forEach((listener) => listener());
    }
  };
  return Promise.allSettled([estimateStorage(), countStoredRecords(), isStoragePersisted()]).then(
    ([usage, counts, persisted]) => apply({
      loaded: true,
      usage: usage.status === 'fulfilled' ? usage.value : status.usage,
      counts: counts.status === 'fulfilled' ? counts.value : status.counts,
      persisted: persisted.status === 'fulfilled' ? persisted.value : status.persisted,
    }),
  );
}

/** The shared storage status; refreshed when the first control mounts on each visit. */
export function useStorageStatus(): StorageStatus {
  return useSyncExternalStore(subscribe, () => status);
}

/** Test hook: forget the cached status. */
export function resetStorageStatus(): void {
  status = INITIAL;
  generation = 0;
}
