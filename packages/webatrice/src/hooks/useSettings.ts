import { useMemo, useSyncExternalStore } from 'react';
import { liveQuery, type Subscription } from 'dexie';

import { migrateSetting, SettingDTO, type SettingsPatch } from '@app/services';
import { APP_USER, PREFERENCE_DEFAULTS, PreferenceKey, Preferences } from '@app/types';
import { LEGACY_PLAYMAT_SETTINGS_KEY } from '../services/dexie/playmatSettings';
import { createSharedStore, Loadable, LoadingState, useSharedStore } from './useSharedStore';

function createSettingsStore() {
  let subscription: Subscription | undefined;
  let revision = 0;
  const pending = new Set<SettingsPatch>();
  const withPending = (row: SettingDTO): SettingDTO => {
    const next = Object.assign(new SettingDTO(row.user), row);
    for (const patch of pending) {
      Object.assign(next, typeof patch === 'function' ? patch(next) : patch);
    }
    return next;
  };
  const store = createSharedStore<SettingDTO>(async () => {
    const loaded = await SettingDTO.patch(APP_USER);
    subscription = liveQuery(async () => {
      const observedRevision = revision;
      const row = await SettingDTO.get(APP_USER);
      return { row: row ? migrateSetting(row) : undefined, observedRevision };
    }).subscribe({
      next: ({ row, observedRevision }) => {
        if (row && observedRevision === revision) {
          store.setValue(withPending(row));
        } else if (row) {
          void refresh().catch((error) => console.warn('Failed to refresh settings', error));
        }
      },
      error: (error) => console.warn('Failed to refresh settings', error),
    });
    try {
      globalThis.localStorage?.removeItem(LEGACY_PLAYMAT_SETTINGS_KEY);
    } catch { /* storage unavailable */ }
    return loaded;
  });
  const refresh = async () => {
    const observedRevision = revision;
    const row = await SettingDTO.get(APP_USER);
    if (row && observedRevision === revision) {
      store.setValue(withPending(migrateSetting(row)));
    }
  };
  return {
    ...store,
    update: async (patch: SettingsPatch) => {
      const current = store.peek() ?? await store.whenReady();
      const queuedPatch: SettingsPatch = (row) => typeof patch === 'function' ? patch(row) : patch;
      pending.add(queuedPatch);
      revision++;
      store.setValue(Object.assign(new SettingDTO(current.user), current,
        typeof patch === 'function' ? patch(current) : patch));
      try {
        const saved = await SettingDTO.patch(APP_USER, patch);
        pending.delete(queuedPatch);
        revision++;
        store.setValue(withPending(saved));
      } catch (error) {
        pending.delete(queuedPatch);
        revision++;
        await refresh();
        throw error;
      }
    },
    reset: () => {
      subscription?.unsubscribe();
      subscription = undefined;
      pending.clear();
      revision++;
      store.reset();
    },
  };
}

export const settingsStore = createSettingsStore();
const store = settingsStore;

export type SettingsHook = Loadable<SettingDTO> & {
  update: (patch: SettingsPatch) => Promise<void>;
};

export function useSettings(): SettingsHook {
  const state = useSharedStore(store);

  const update = async (patch: SettingsPatch) => {
    const current = store.peek();
    if (!current) {
      throw new Error('useSettings.update called before settings loaded');
    }
    await updateSettings(patch);
  };

  return { ...state, update };
}

export const getSettings = (): Promise<SettingDTO> => Promise.resolve(store.peek() ?? store.whenReady());

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  await store.update(patch);
}

export function usePreferences(): Preferences {
  const state = useSharedStore(store);
  return useMemo(
    () => (state.status === LoadingState.READY && state.value ? { ...state.value } : PREFERENCE_DEFAULTS),
    [state],
  );
}

export function usePreference<K extends PreferenceKey>(key: K): Preferences[K] {
  return useSyncExternalStore(store.subscribe, () => getPreferencesSnapshot()[key]);
}

export function getPreferencesSnapshot(): Preferences {
  return store.peek() ?? PREFERENCE_DEFAULTS;
}

export function useMessageMacros(): readonly string[] {
  return usePreference('messageMacros');
}
