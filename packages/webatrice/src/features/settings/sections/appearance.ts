import { Palette } from 'lucide-react';

import { SettingsSectionId, type SettingsSection } from '../registry';

/**
 * Appearance page (desktop appearance_settings_page.cpp): the board's hand and table layout.
 * Themes, playmats and the rest register further groups on this section id.
 */
export const appearanceSection: SettingsSection = {
  id: SettingsSectionId.Appearance,
  titleKey: 'Settings.section.appearance',
  icon: Palette,
  groups: [
    {
      id: 'appearance.handLayout',
      titleKey: 'SettingsAppearance.group.handLayout',
      entries: [
        {
          id: 'horizontalHand',
          labelKey: 'SettingsAppearance.horizontalHand.label',
          descriptionKey: 'SettingsAppearance.horizontalHand.description',
          control: { kind: 'toggle', key: 'horizontalHand' },
        },
        {
          id: 'leftJustifiedHand',
          labelKey: 'SettingsAppearance.leftJustifiedHand.label',
          descriptionKey: 'SettingsAppearance.leftJustifiedHand.description',
          control: { kind: 'toggle', key: 'leftJustifiedHand' },
        },
      ],
    },
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
