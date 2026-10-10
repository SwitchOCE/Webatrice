import { Palette } from 'lucide-react';

import { ThemeMode } from '@app/types';

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
          control: {
            kind: 'select',
            key: 'themeMode',
            options: [
              { value: ThemeMode.Light, labelKey: 'SettingsAppearance.themeMode.light' },
              { value: ThemeMode.Dark, labelKey: 'SettingsAppearance.themeMode.dark' },
              { value: ThemeMode.System, labelKey: 'SettingsAppearance.themeMode.system' },
            ],
          },
        },
      ],
    },
  ],
};
