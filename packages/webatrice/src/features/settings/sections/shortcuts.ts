import { Keyboard } from 'lucide-react';

import { ShortcutsTab } from '@app/feature-widgets/shortcuts';

import { SettingsSectionId, type SettingsSection } from '../registry';

export const shortcutsSection: SettingsSection = {
  id: SettingsSectionId.Shortcuts,
  titleKey: 'Settings.section.shortcuts',
  icon: Keyboard,
  component: ShortcutsTab,
};
