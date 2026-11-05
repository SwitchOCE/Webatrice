import { useMemo, useSyncExternalStore } from 'react';
import { liveQuery, type Subscription } from 'dexie';

import { migrateSetting, SettingDTO, type SettingsPatch } from '@app/services';
import { APP_USER, PREFERENCE_DEFAULTS, PreferenceKey, Preferences } from '@app/types';
import { LEGACY_PLAYMAT_SETTINGS_KEY } from '../services/dexie/playmatSettings';
import { createSharedStore, Loadable, LoadingState, useSharedStore } from './useSharedStore';

function createSettingsStore() {
  let subscription: Subscription | undefined;
  const store = createSharedStore<SettingDTO>(async () => {
    const loaded = await SettingDTO.patch(APP_USER);
    subscription = liveQuery(async () => {
      const row = await SettingDTO.get(APP_USER);
      return row ? migrateSetting(row) : undefined;
    }).subscribe((row) => {
      if (row) {
        store.setValue(row);
      }
    });
    try {
      globalThis.localStorage?.removeItem(LEGACY_PLAYMAT_SETTINGS_KEY);
    } catch { /* storage unavailable */ }
    return loaded;
  });
  return {
    ...store,
    reset: () => {
      subscription?.unsubscribe();
      subscription = undefined;
      store.reset();
    },
  };
}

export const settingsStore = createSettingsStore();
const store = settingsStore;

export type SettingsHook = Loadable<SettingDTO> & {
  update: (patch: Partial<SettingDTO>) => Promise<void>;
};

export function useSettings(): SettingsHook {
  const state = useSharedStore(store);

  const update = async (patch: Partial<SettingDTO>) => {
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
  await getSettings();
  store.setValue(await SettingDTO.patch(APP_USER, patch));
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
