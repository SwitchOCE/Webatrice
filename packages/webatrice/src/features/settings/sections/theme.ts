import { Palette } from 'lucide-react';

import { ThemeMode } from '@app/types';

import { SettingsSectionId, type SettingsSection } from '../registry';

/**
 * Appearance › Theme settings (desktop appearance_settings_page.cpp "Active theme palette").
 * Desktop's theme folders, Qt style and palette editor have no browser counterpart; the palette
 * choice applies live through `AppThemeProvider`.
 */
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
            // Desktop's order.
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
