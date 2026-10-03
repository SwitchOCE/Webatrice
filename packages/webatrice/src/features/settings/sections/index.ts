import { buildSettingsSections, type SettingsSection } from '../registry';
import { appearanceSection } from './appearance';
import { chatSection } from './chat';
import { generalSection } from './general';
import { shortcutsSection } from './shortcuts';
import { soundSection } from './sound';
import { storageSection } from './storage';
import { themeSection } from './theme';
import { userInterfaceSection } from './userInterface';

/**
 * The one list of Settings page registrations. To add a page or extend one, export a
 * `SettingsSection` from a module in this folder and list it here; order within the page comes
 * from SECTION_ORDER, and registrations sharing an id have their groups merged.
 */
const registrations: readonly SettingsSection[] = [
  generalSection,
  themeSection,
  appearanceSection,
  userInterfaceSection,
  storageSection,
  chatSection,
  soundSection,
  shortcutsSection,
];

export const settingsSections: readonly SettingsSection[] = buildSettingsSections(registrations);
