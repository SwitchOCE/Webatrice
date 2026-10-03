import { Settings2 } from 'lucide-react';

import { Language, LanguageNative, StartupTab, type Preferences } from '@app/types';

import DebugLogButton from '../controls/DebugLogButton';
import StartupServerSelect from '../controls/StartupServerSelect';
import { SettingsSectionId, type SettingsSection } from '../registry';

const startsInRoom = ({ startupTab }: Preferences) => startupTab === StartupTab.ServerRoom;

/**
 * General page (desktop general_settings_page.cpp). Desktop's update-channel, Oracle and path
 * settings have no browser meaning; see the parity matrix rows LONG-008 and LONG-015.
 */
export const generalSection: SettingsSection = {
  id: SettingsSectionId.General,
  titleKey: 'Settings.section.general',
  icon: Settings2,
  groups: [
    {
      id: 'general.language',
      titleKey: 'SettingsGeneral.group.language',
      entries: [
        {
          id: 'language',
          labelKey: 'SettingsGeneral.language.label',
          descriptionKey: 'SettingsGeneral.language.description',
          control: {
            kind: 'select',
            key: 'language',
            options: [
              { value: '', labelKey: 'SettingsGeneral.language.followBrowser' },
              // Native names, as desktop lists them: a reader of that language finds it whatever
              // language the UI is in now.
              ...Object.values(Language).map((language) => ({ value: language, label: LanguageNative[language] })),
            ],
          },
        },
      ],
    },
    {
      id: 'general.version',
      titleKey: 'SettingsGeneral.group.version',
      entries: [
        {
          id: 'notifyAboutMissingFeatures',
          labelKey: 'SettingsGeneral.notifyAboutMissingFeatures.label',
          descriptionKey: 'SettingsGeneral.notifyAboutMissingFeatures.description',
          control: { kind: 'toggle', key: 'notifyAboutMissingFeatures' },
        },
      ],
    },
    {
      id: 'general.startup',
      titleKey: 'SettingsGeneral.group.startup',
      entries: [
        {
          id: 'startupTab',
          labelKey: 'SettingsGeneral.startupTab.label',
          descriptionKey: 'SettingsGeneral.startupTab.description',
          control: {
            kind: 'select',
            key: 'startupTab',
            options: [
              { value: StartupTab.DeckStorage, labelKey: 'SettingsGeneral.startupTab.deckStorage' },
              { value: StartupTab.Replays, labelKey: 'SettingsGeneral.startupTab.replays' },
              { value: StartupTab.Server, labelKey: 'SettingsGeneral.startupTab.server' },
              { value: StartupTab.ServerRoom, labelKey: 'SettingsGeneral.startupTab.serverRoom' },
            ],
          },
        },
        {
          id: 'startupServer',
          labelKey: 'SettingsGeneral.startupServer.label',
          descriptionKey: 'SettingsGeneral.startupServer.description',
          control: { kind: 'custom', component: StartupServerSelect, keys: ['startupServer'] },
          // Desktop also shows it for "Server", where it picks the server to connect to at launch.
          // Here the login form's Auto Connect does that, so it only scopes the room.
          visibleWhen: startsInRoom,
        },
        {
          id: 'startupRoom',
          labelKey: 'SettingsGeneral.startupRoom.label',
          control: { kind: 'text', key: 'startupRoom', placeholderKey: 'SettingsGeneral.startupRoom.placeholder' },
          visibleWhen: startsInRoom,
        },
      ],
    },
    {
      id: 'general.diagnostics',
      titleKey: 'SettingsGeneral.group.diagnostics',
      entries: [
        {
          id: 'debugLog',
          labelKey: 'SettingsGeneral.debugLog.label',
          descriptionKey: 'SettingsGeneral.debugLog.description',
          // The dialog's own "Clear log when closing" box edits this preference.
          control: { kind: 'custom', component: DebugLogButton, keys: ['clearDebugLogOnClose'] },
        },
      ],
    },
  ],
};
