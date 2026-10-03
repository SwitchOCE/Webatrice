import { Palette } from 'lucide-react';

import { SettingsSectionId, type SettingsSection } from '../registry';

/**
 * Appearance page (desktop appearance_settings_page.cpp). Only the table-grid option the board
 * already honours lives here for now; themes, card rendering and the rest register further
 * groups on this section id.
 */
export const appearanceSection: SettingsSection = {
  id: SettingsSectionId.Appearance,
  titleKey: 'Settings.section.appearance',
  icon: Palette,
  groups: [
    {
      id: 'appearance.tableGrid',
      titleKey: 'SettingsAppearance.group.tableGrid',
      entries: [
        {
          id: 'invertVerticalCoordinate',
          labelKey: 'SettingsAppearance.invertVerticalCoordinate.label',
          descriptionKey: 'SettingsAppearance.invertVerticalCoordinate.description',
          control: { kind: 'toggle', key: 'invertVerticalCoordinate' },
        },
        {
          id: 'minPlayersForMultiColumnLayout',
          labelKey: 'SettingsAppearance.minPlayersForMultiColumnLayout.label',
          // Desktop's spin box: at least 2, and QSpinBox's default ceiling.
          control: { kind: 'number', key: 'minPlayersForMultiColumnLayout', min: 2, max: 99 },
        },
      ],
    },
  ],
};
