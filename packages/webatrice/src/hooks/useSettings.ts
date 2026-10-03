import { useMemo, useSyncExternalStore } from 'react';

import { migrateSetting, SettingDTO } from '@app/services';
import { APP_USER, PREFERENCE_DEFAULTS, PreferenceKey, Preferences } from '@app/types';
import { createSharedStore, Loadable, LoadingState, useSharedStore } from './useSharedStore';

export const settingsStore = createSharedStore<SettingDTO>(async () => {
  let loaded: SettingDTO | undefined = await SettingDTO.get(APP_USER);
  if (!loaded) {
    loaded = new SettingDTO(APP_USER);
    await loaded.save();
  }
  return migrateSetting(loaded);
});
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
    Object.assign(current, patch);
    await current.save();
    store.setValue(current);
  };

  return { ...state, update };
}

export const getSettings = (): Promise<SettingDTO> => store.whenReady();

/**
 * The current value of every preference, falling back to the desktop defaults until the row has
 * loaded (or if it failed to). Reactive — re-renders when any preference changes.
 */
export function usePreferences(): Preferences {
  const state = useSharedStore(store);
  // `update` mutates the loaded DTO in place, so hand out a copy per snapshot: a consumer that
  // memoizes on the returned object then sees a new reference whenever a preference changes.
  return useMemo(
    () => (state.status === LoadingState.READY && state.value ? { ...state.value } : PREFERENCE_DEFAULTS),
    [state],
  );
}

/**
 * One preference's current value; the desktop default until settings have loaded. Re-renders only
 * when that preference changes, so board components can read one without following the rest.
 */
export function usePreference<K extends PreferenceKey>(key: K): Preferences[K] {
  return useSyncExternalStore(store.subscribe, () => getPreferencesSnapshot()[key]);
}

/**
 * Non-reactive read for event handlers and services reacting to something that just happened
 * (a sound to play, a notification to raise): the preference as it is right now.
 */
export function getPreferencesSnapshot(): Preferences {
  return store.peek() ?? PREFERENCE_DEFAULTS;
}

/**
 * The user's in-game message macros, in order. Desktop's Say menu lists these and binds the
 * first ten to Ctrl+1..0; the game's Say menu reads them from here.
 */
export function useMessageMacros(): readonly string[] {
  return usePreference('messageMacros');
}
