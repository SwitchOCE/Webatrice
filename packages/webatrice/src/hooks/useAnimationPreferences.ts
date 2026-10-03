import { useSyncExternalStore } from 'react';

import type { Preferences } from '@app/types';
import { usePreference } from './useSettings';

/** Desktop's animation settings (User Interface › Animation settings), in its order. */
export const ANIMATION_PREFERENCE_KEYS = [
  'tapAnimation',
  'arrowDrawAnimation',
  'lifeCounterAnimations',
  'battlefieldFlash',
] as const;
export type AnimationPreferenceKey = (typeof ANIMATION_PREFERENCE_KEYS)[number];

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function reducedMotionQuery(): MediaQueryList | undefined {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : undefined;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query?.addEventListener?.('change', onChange);
  return () => query?.removeEventListener?.('change', onChange);
}

/** Whether the operating system asks for reduced motion. */
export function systemPrefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches ?? false;
}

/** The operating system's reduced-motion setting, re-rendering when it changes. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToReducedMotion, systemPrefersReducedMotion, () => false);
}

/**
 * Whether an animation plays. Until the user has chosen (any animation toggle, or "Enable all" /
 * "Disable all"), the operating system's reduced-motion setting turns the animations off; desktop's
 * defaults (all on) apply otherwise. Once chosen, the choice stands whatever the system says.
 */
export function resolveAnimation(
  preferences: Pick<Preferences, AnimationPreferenceKey | 'animationsChosen'>,
  key: AnimationPreferenceKey,
  reducedMotion: boolean,
): boolean {
  return preferences.animationsChosen ? preferences[key] : preferences[key] && !reducedMotion;
}

/** One animation setting as it applies now (resolveAnimation, reading only what it needs). */
export function useAnimationPreference(key: AnimationPreferenceKey): boolean {
  const animationsChosen = usePreference('animationsChosen');
  const value = usePreference(key);
  const reducedMotion = usePrefersReducedMotion();
  return animationsChosen ? value : value && !reducedMotion;
}

/**
 * The write that records an animation choice: every animation as it shows now (so the ones the
 * user did not touch keep what they see), `changes` on top, and the choice marked as made.
 */
export function chooseAnimations(
  preferences: Pick<Preferences, AnimationPreferenceKey | 'animationsChosen'>,
  reducedMotion: boolean,
  changes: Partial<Record<AnimationPreferenceKey, boolean>>,
): Partial<Preferences> {
  const patch: Partial<Preferences> = { animationsChosen: true };
  for (const key of ANIMATION_PREFERENCE_KEYS) {
    patch[key] = changes[key] ?? resolveAnimation(preferences, key, reducedMotion);
  }
  return patch;
}
