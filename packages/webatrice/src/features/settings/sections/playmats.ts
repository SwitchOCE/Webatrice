import { Palette } from 'lucide-react';

import PlaymatSettingsPanel from '../playmats/PlaymatSettingsPanel';
import { SettingsSectionId, type SettingsSection } from '../registry';

/** Appearance playmat controls, including the preferences reset by Restore defaults. */
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
          control: { kind: 'custom', component: PlaymatSettingsPanel, keys: ['playmatSettings'], layout: 'block' },
        },
      ],
    },
  ],
};
