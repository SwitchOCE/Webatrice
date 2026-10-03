import { Keyboard } from 'lucide-react';

import { ShortcutsTab } from '@app/feature-widgets/shortcuts';

import { SettingsSectionId, type SettingsSection } from '../registry';

/** Shortcuts page (desktop shortcut_settings_page.cpp). Has its own search; found by title here. */
export const shortcutsSection: SettingsSection = {
  id: SettingsSectionId.Shortcuts,
  titleKey: 'Settings.section.shortcuts',
  icon: Keyboard,
  component: ShortcutsTab,
};
