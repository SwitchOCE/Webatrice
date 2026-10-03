import { Volume2 } from 'lucide-react';

import { SOUND_THEMES, soundEngine } from '@app/services';
import type { Preferences } from '@app/types';

import SoundTestButton from '../controls/SoundTestButton';
import { SettingsSectionId, type SettingsSection } from '../registry';

const testSound = ({ soundEnabled, soundTheme, masterVolume }: Preferences) =>
  soundEngine.test({ enabled: soundEnabled, theme: soundTheme, volume: masterVolume });

/**
 * Sound page (desktop sound_settings_page.cpp), in desktop's order. Like desktop, the volume and
 * theme stay editable while sound is off; the test button, which would play nothing, does not.
 */
export const soundSection: SettingsSection = {
  id: SettingsSectionId.Sound,
  titleKey: 'Settings.section.sound',
  icon: Volume2,
  groups: [
    {
      id: 'sound.settings',
      titleKey: 'SettingsSound.group.sound',
      entries: [
        {
          id: 'soundEnabled',
          labelKey: 'SettingsSound.soundEnabled.label',
          descriptionKey: 'SettingsSound.soundEnabled.description',
          control: { kind: 'toggle', key: 'soundEnabled' },
        },
        {
          id: 'masterVolume',
          labelKey: 'SettingsSound.masterVolume.label',
          // Desktop plays the test sound when the slider is let go.
          control: { kind: 'range', key: 'masterVolume', min: 0, max: 100, onCommit: testSound },
        },
        {
          id: 'soundTheme',
          labelKey: 'SettingsSound.soundTheme.label',
          control: {
            kind: 'select',
            key: 'soundTheme',
            options: Object.keys(SOUND_THEMES).map((theme) => ({ value: theme, label: theme })),
          },
        },
        {
          id: 'soundTest',
          labelKey: 'SettingsSound.test.label',
          control: { kind: 'custom', component: SoundTestButton },
        },
      ],
    },
  ],
};
