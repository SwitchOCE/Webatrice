import { useCallback, useSyncExternalStore } from 'react';

import { games } from '@cockatrice/datatrice';

/** Desktop PlaymatVisibility: whether playmats are drawn in-game, and for whom. */
export const PlaymatVisibility = {
  NONE: 0,
  OWN_ONLY: 1,
  ALL: 2,
} as const;
export type PlaymatVisibility = typeof PlaymatVisibility[keyof typeof PlaymatVisibility];

/** Desktop PlaymatMode: how the user's playmat collection interacts with a deck's own playmat. */
export const PlaymatMode = {
  OVERRIDE_DECK: 0,
  FALLBACK: 1,
  DECK_ONLY: 2,
} as const;
export type PlaymatMode = typeof PlaymatMode[keyof typeof PlaymatMode];

/** Desktop PlaymatFallbackMode: how an entry is picked from the collection. */
export const PlaymatFallbackBehavior = {
  FIXED: 0,
  ROUND_ROBIN: 1,
  RANDOM: 2,
} as const;
export type PlaymatFallbackBehavior = typeof PlaymatFallbackBehavior[keyof typeof PlaymatFallbackBehavior];

export interface PlaymatSettings {
  visibility: PlaymatVisibility;
  mode: PlaymatMode;
  fallbackBehavior: PlaymatFallbackBehavior;
  /** The user's playmat collection ("Default playmats"), in order. */
  fallbackList: games.Playmat[];
}

/** Desktop InterfaceSettings defaults: show all, fall back to the collection, fixed pick, empty collection. */
export const DEFAULT_PLAYMAT_SETTINGS: PlaymatSettings = {
  visibility: PlaymatVisibility.ALL,
  mode: PlaymatMode.FALLBACK,
  fallbackBehavior: PlaymatFallbackBehavior.FIXED,
  fallbackList: [],
};

/*
 * Settings seam. The playmat preferences live in their own localStorage key
 * until the typed settings framework (a `Setting` row with PREFERENCE_DEFAULTS
 * and a sections registry) lands. Moving them is mechanical: the four fields
 * become preferences with the defaults above, `usePlaymatSettings` reads them
 * through `usePreferences`, and `PlaymatSettingsPanel` registers as the
 * "Playmat settings" group of the Appearance section, where desktop shows it.
 */
const STORAGE_KEY = 'webatrice.playmatSettings';

const oneOf = <T extends number>(values: Record<string, T>, value: unknown, fallback: T): T =>
  (Object.values(values) as unknown[]).includes(value) ? (value as T) : fallback;

function parsePlaymat(value: unknown): games.Playmat | null {
  const entry = value as Partial<games.Playmat> | null;
  if (!entry || typeof entry.cardName !== 'string' || !entry.cardName) {
    return null;
  }
  return {
    cardName: entry.cardName,
    cardProviderId: typeof entry.cardProviderId === 'string' ? entry.cardProviderId : '',
    params: games.clampPlaymatParams({ ...games.DEFAULT_PLAYMAT_PARAMS, ...entry.params }),
  };
}

/** Reads stored settings defensively: unknown enum values and malformed entries fall back to the defaults. */
export function parsePlaymatSettings(raw: string | null): PlaymatSettings {
  let stored: Partial<PlaymatSettings> = {};
  try {
    stored = raw ? JSON.parse(raw) ?? {} : {};
  } catch {
    stored = {};
  }
  return {
    visibility: oneOf(PlaymatVisibility, stored.visibility, DEFAULT_PLAYMAT_SETTINGS.visibility),
    mode: oneOf(PlaymatMode, stored.mode, DEFAULT_PLAYMAT_SETTINGS.mode),
    fallbackBehavior: oneOf(PlaymatFallbackBehavior, stored.fallbackBehavior, DEFAULT_PLAYMAT_SETTINGS.fallbackBehavior),
    fallbackList: Array.isArray(stored.fallbackList)
      ? stored.fallbackList.map(parsePlaymat).filter((entry): entry is games.Playmat => entry !== null)
      : [],
  };
}

function loadPersisted(): PlaymatSettings {
  try {
    return parsePlaymatSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PLAYMAT_SETTINGS;
  }
}

let singleton: PlaymatSettings = loadPersisted();
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = (): PlaymatSettings => singleton;

/** One-shot read for effects and event handlers. */
export const getPlaymatSettings = getSnapshot;

export function setPlaymatSettings(patch: Partial<PlaymatSettings>): void {
  singleton = { ...singleton, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(singleton));
  } catch {
    /* storage unavailable: keep the in-memory value for this session */
  }
  listeners.forEach((cb) => cb());
}

/** Reactive read; every consumer re-renders when a setting changes. */
export function usePlaymatSettings(): PlaymatSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Reactive read plus the setter, for the settings panel. */
export function usePlaymatSettingsState(): [PlaymatSettings, (patch: Partial<PlaymatSettings>) => void] {
  const value = usePlaymatSettings();
  const update = useCallback((patch: Partial<PlaymatSettings>) => setPlaymatSettings(patch), []);
  return [value, update];
}
