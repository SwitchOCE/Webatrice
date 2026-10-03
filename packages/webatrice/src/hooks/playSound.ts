import { soundEngine, type SoundName } from '@app/services';

import { getPreferencesSnapshot } from './useSettings';

/**
 * Plays an event sound with the user's sound preferences as they are right now; silent when
 * sound is off. For handlers reacting to an event, so it reads the preferences once, not reactively.
 */
export function playSound(name: SoundName): void {
  const { soundEnabled, soundTheme, masterVolume } = getPreferencesSnapshot();
  soundEngine.play(name, { enabled: soundEnabled, theme: soundTheme, volume: masterVolume });
}
