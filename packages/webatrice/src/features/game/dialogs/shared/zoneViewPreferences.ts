import type { GroupMode, SortMode } from './zoneViewSort';

/**
 * A zone view's remembered choices, kept across sessions like desktop's
 * SettingsCache (view_zone_widget.cpp:161-163, cache_settings.cpp:383-384).
 * Each view family stores its own under its storage key prefix, so the
 * library search and an incoming reveal can be tuned independently.
 */
export interface ZoneViewPreferences {
  groupBy: GroupMode;
  sortBy: SortMode;
  /** Stack each group into a fanned pile (view_zone_widget.cpp:64,197). */
  pileView: boolean;
}

const GROUP_MODES: readonly GroupMode[] = ['none', 'type', 'cmc', 'color'];
const SORT_MODES: readonly SortMode[] = ['none', 'name', 'cmc', 'type', 'color', 'set', 'pt'];

/** Desktop's defaults: `zoneview/groupby` By Type and `zoneview/sortby` By Name. Pile view is on
 *  so a 90+ card library fits without endless scrolling. */
export const DEFAULT_ZONE_VIEW_PREFERENCES: ZoneViewPreferences = { groupBy: 'type', sortBy: 'name', pileView: true };

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage disabled or full: the choice holds for this view only.
  }
}

/** The choices stored under `storageKey`, each falling back to desktop's default when unset or unknown. */
export function readZoneViewPreferences(storageKey: string): ZoneViewPreferences {
  const groupBy = read(`${storageKey}GroupBy`);
  const sortBy = read(`${storageKey}SortBy`);
  const pileView = read(`${storageKey}PileView`);
  return {
    groupBy: GROUP_MODES.find((m) => m === groupBy) ?? DEFAULT_ZONE_VIEW_PREFERENCES.groupBy,
    sortBy: SORT_MODES.find((m) => m === sortBy) ?? DEFAULT_ZONE_VIEW_PREFERENCES.sortBy,
    pileView: pileView === null ? DEFAULT_ZONE_VIEW_PREFERENCES.pileView : pileView === '1',
  };
}

/** Persist only the supplied choices so other open views' saved choices are preserved. */
export function writeZoneViewPreferences(storageKey: string, prefs: Partial<ZoneViewPreferences>): void {
  if (prefs.groupBy !== undefined) {
    write(`${storageKey}GroupBy`, prefs.groupBy);
  }
  if (prefs.sortBy !== undefined) {
    write(`${storageKey}SortBy`, prefs.sortBy);
  }
  if (prefs.pileView !== undefined) {
    write(`${storageKey}PileView`, prefs.pileView ? '1' : '0');
  }
}

/**
 * The library view's "shuffle when closing" choice. On by default, as on
 * desktop. Read when a view closes without an explicit answer (Esc), so every
 * close path honours the box the user last ticked.
 */
const SHUFFLE_ON_CLOSE_STORAGE_KEY = 'webatrice.searchLibraryShuffleOnClose';

export function readShuffleOnClose(): boolean {
  return read(SHUFFLE_ON_CLOSE_STORAGE_KEY) !== '0';
}

export function writeShuffleOnClose(value: boolean): void {
  write(SHUFFLE_ON_CLOSE_STORAGE_KEY, value ? '1' : '0');
}
