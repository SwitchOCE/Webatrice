import { useEffect, useSyncExternalStore } from 'react';

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
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Re-reads usage, table counts and persistence. The Storage page's controls share one status,
 * so a clear made by one control updates the figures shown by the others.
 */
export function refreshStorageStatus(): Promise<void> {
  pending ??= Promise.all([estimateStorage(), countStoredRecords(), isStoragePersisted()])
    .then(([usage, counts, persisted]) => {
      status = { loaded: true, usage, counts, persisted };
    })
    .catch(() => {
      // IndexedDB unavailable (private mode in some browsers): show what is known, nothing more.
      status = { ...status, loaded: true };
    })
    .finally(() => {
      pending = null;
      listeners.forEach((listener) => listener());
    });
  return pending;
}

/** The shared storage status; reads it when the first control mounts. */
export function useStorageStatus(): StorageStatus {
  const current = useSyncExternalStore(subscribe, () => status);
  useEffect(() => {
    if (!status.loaded) {
      void refreshStorageStatus();
    }
  }, []);
  return current;
}

/** Test hook: forget the cached status. */
export function resetStorageStatus(): void {
  status = INITIAL;
  pending = null;
}
