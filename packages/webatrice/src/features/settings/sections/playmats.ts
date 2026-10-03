import { Palette } from 'lucide-react';

import PlaymatSettingsPanel from '../playmats/PlaymatSettingsPanel';
import { SettingsSectionId, type SettingsSection } from '../registry';

/**
 * Appearance › Playmat settings (desktop appearance_settings_page.cpp "Playmat settings" and its
 * "Default Playmats" dialog). The panel keeps its own storage and saves each change itself, so
 * "Restore defaults" leaves it alone.
 */
export const playmatsSection: SettingsSection = {
  id: SettingsSectionId.Appearance,
  titleKey: 'Settings.section.appearance',
  icon: Palette,
  groups: [
    {
      id: 'appearance.playmats',
      titleKey: 'PlaymatSettings.title',
      entries: [
        {
          id: 'playmats',
          labelKey: 'PlaymatSettings.label',
          control: { kind: 'custom', component: PlaymatSettingsPanel, layout: 'block' },
        },
      ],
    },
  ],
};
