import { Palette } from 'lucide-react';

import ThemeTiles from '../controls/ThemeTiles';
import { SettingsSectionId, type SettingsSection } from '../registry';

export const themeSection: SettingsSection = {
  id: SettingsSectionId.Appearance,
  titleKey: 'Settings.section.appearance',
  icon: Palette,
  groups: [
    {
      id: 'appearance.theme',
      titleKey: 'SettingsAppearance.group.theme',
      entries: [
        {
          id: 'themeMode',
          labelKey: 'SettingsAppearance.themeMode.label',
          descriptionKey: 'SettingsAppearance.themeMode.description',
          control: { kind: 'custom', component: ThemeTiles, keys: ['themeMode'], layout: 'block' },
        },
      ],
    },
  ],
};
