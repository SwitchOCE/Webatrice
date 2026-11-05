import { type PlaymatSettings } from '@app/types';
import { getPreferencesSnapshot, updateSettings, usePreference } from './useSettings';

export { DEFAULT_PLAYMAT_SETTINGS, PlaymatVisibility, PlaymatMode, PlaymatFallbackBehavior } from '@app/types';
export type { PlaymatSettings } from '@app/types';
export { parsePlaymatSettings } from '../services/dexie/playmatSettings';

export const getPlaymatSettings = (): PlaymatSettings => getPreferencesSnapshot().playmatSettings;

export function setPlaymatSettings(patch: Partial<PlaymatSettings>): Promise<void> {
  return updateSettings((current) => ({ playmatSettings: { ...current.playmatSettings, ...patch } }));
}

export function usePlaymatSettings(): PlaymatSettings {
  return usePreference('playmatSettings');
}

export function usePlaymatSettingsState(): [PlaymatSettings, typeof setPlaymatSettings] {
  return [usePlaymatSettings(), setPlaymatSettings];
}
