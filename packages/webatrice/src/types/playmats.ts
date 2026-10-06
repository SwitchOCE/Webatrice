import type { games } from '@cockatrice/datatrice';

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
  fallbackList: readonly games.Playmat[];
}

/** Desktop InterfaceSettings defaults: show all, fall back to the collection, fixed pick, empty collection. */
export const DEFAULT_PLAYMAT_SETTINGS: PlaymatSettings = Object.freeze({
  visibility: PlaymatVisibility.ALL,
  mode: PlaymatMode.FALLBACK,
  fallbackBehavior: PlaymatFallbackBehavior.FIXED,
  fallbackList: Object.freeze([]),
});


/** Servatrice string_limits.h MAX_NAME_LENGTH. */
export const PLAYMAT_NAME_MAX_LENGTH = 255;
