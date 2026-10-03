import { PREFERENCE_DEFAULTS, PreferenceKey, Preferences, SETTINGS_VERSION, Setting, ThemeMode } from '@app/types';
import { LANGUAGE_STORAGE_KEY, resolveSupportedLanguage } from '@app/utils';

type SettingRow = Partial<Setting> & { user: string };

/**
 * Ordered settings-row migrations, keyed by the version they produce. Each step mutates the row
 * in place (Dexie's `Collection.modify` contract) and must preserve every value the user set.
 */
const MIGRATIONS: Record<number, (row: SettingRow) => void> = {
  // v1: first versioned schema. Pre-v1 rows hold only autoConnect, invertVerticalCoordinate and
  // shortcut overrides; every preference introduced with the Settings page takes its default.
  1: (row) => fillPreferenceDefaults(row),
  // v2: theme palette and language become settings. A row that predates them belongs to someone
  // who has only ever seen the dark palette, so they keep it (fresh installs follow the system,
  // as desktop does). Their language was i18next's own localStorage cache; adopt it. Neither
  // preference existed before v2, so assigning (rather than filling) cannot lose a choice — and
  // must assign, because step 1 has already filled a v0 row with the fresh-install defaults.
  2: (row) => {
    row.themeMode = ThemeMode.Dark;
    row.language = legacyLanguageChoice() ?? '';
  },
};

function legacyLanguageChoice(): string | undefined {
  try {
    return resolveSupportedLanguage(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return undefined; // storage blocked (privacy mode); fall back to the browser language
  }
}

/** Adds a default for every preference the row lacks. Never overwrites a stored value. */
export function fillPreferenceDefaults(row: Partial<Preferences>): void {
  const target = row as Record<PreferenceKey, unknown>;
  for (const key of Object.keys(PREFERENCE_DEFAULTS) as PreferenceKey[]) {
    if (target[key] === undefined) {
      // Clone so rows never share the defaults' arrays.
      target[key] = structuredClone(PREFERENCE_DEFAULTS[key]);
    }
  }
}

/**
 * Brings a stored settings row up to SETTINGS_VERSION. Idempotent: a current row is only
 * checked for missing defaults. Runs from the Dexie upgrade and again on every load, so a row
 * written by an older tab or restored from a backup is still complete.
 */
export function migrateSetting<T extends SettingRow>(row: T): T & Setting {
  const from = row.version ?? 0;
  for (let version = from + 1; version <= SETTINGS_VERSION; version++) {
    MIGRATIONS[version]?.(row);
  }
  fillPreferenceDefaults(row);
  row.version = Math.max(from, SETTINGS_VERSION);
  return row as T & Setting;
}
