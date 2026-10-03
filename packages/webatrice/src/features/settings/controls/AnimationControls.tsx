import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ANIMATION_PREFERENCE_KEYS,
  chooseAnimations,
  resolveAnimation,
  usePreferences,
  usePrefersReducedMotion,
  useSettings,
  type AnimationPreferenceKey,
} from '@app/hooks';

import type { CustomControlProps } from '../registry';

/** Records an animation choice (see chooseAnimations) with the preferences as they are now. */
function useChooseAnimations() {
  const settings = useSettings();
  const preferences = usePreferences();
  const reducedMotion = usePrefersReducedMotion();
  return {
    preferences,
    reducedMotion,
    choose: (changes: Partial<Record<AnimationPreferenceKey, boolean>>) => {
      void settings.update(chooseAnimations(preferences, reducedMotion, changes));
    },
  };
}

/**
 * One animation's switch. It shows whether the animation plays now, which until the user chooses
 * follows the system's reduced-motion setting; flipping it records the choice for every animation.
 */
export function animationToggle(key: AnimationPreferenceKey): ComponentType<CustomControlProps> {
  function AnimationToggle({ id, labelId, describedBy, disabled }: CustomControlProps) {
    const { preferences, reducedMotion, choose } = useChooseAnimations();
    return (
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="settings-switch"
        checked={resolveAnimation(preferences, key, reducedMotion)}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        onChange={(e) => choose({ [key]: e.target.checked })}
      />
    );
  }
  AnimationToggle.displayName = `AnimationToggle(${key})`;
  return AnimationToggle;
}

/** Desktop's "Enable all animations" and "Disable all animations" buttons. */
export function AnimationButtons({ labelId, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const { choose } = useChooseAnimations();
  const setAll = (enabled: boolean) => choose(Object.fromEntries(ANIMATION_PREFERENCE_KEYS.map((key) => [key, enabled])));

  return (
    <span className="settings-buttons" role="group" aria-labelledby={labelId}>
      <button type="button" className="settings-button" disabled={disabled} onClick={() => setAll(true)}>
        {t('SettingsUserInterface.animations.enableAll')}
      </button>
      <button type="button" className="settings-button" disabled={disabled} onClick={() => setAll(false)}>
        {t('SettingsUserInterface.animations.disableAll')}
      </button>
    </span>
  );
}
