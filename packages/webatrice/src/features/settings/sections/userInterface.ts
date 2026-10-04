import { MousePointerClick } from 'lucide-react';

import { CommanderSpellbookIntegration } from '@app/types';
import NotificationPermissionControl from '../controls/NotificationPermissionControl';
import { SettingsSectionId, type SettingsSection } from '../registry';

/** User Interface page (desktop user_interface_settings_page.cpp): behaviour the board honours. */
export const userInterfaceSection: SettingsSection = {
  id: SettingsSectionId.UserInterface,
  titleKey: 'Settings.section.userInterface',
  icon: MousePointerClick,
  groups: [
    {
      id: 'userInterface.general',
      titleKey: 'SettingsUserInterface.group.general',
      entries: [
        {
          id: 'playToStack',
          labelKey: 'SettingsUserInterface.playToStack.label',
          descriptionKey: 'SettingsUserInterface.playToStack.description',
          control: { kind: 'toggle', key: 'playToStack' },
        },
        {
          id: 'closeEmptyCardView',
          labelKey: 'SettingsUserInterface.closeEmptyCardView.label',
          control: { kind: 'toggle', key: 'closeEmptyCardView' },
        },
      ],
    },
    {
      id: 'userInterface.notifications',
      titleKey: 'SettingsUserInterface.group.notifications',
      entries: [
        {
          id: 'notificationsEnabled',
          labelKey: 'SettingsUserInterface.notificationsEnabled.label',
          descriptionKey: 'SettingsUserInterface.notificationsEnabled.description',
          control: { kind: 'toggle', key: 'notificationsEnabled' },
        },
        {
          id: 'spectatorNotificationsEnabled',
          labelKey: 'SettingsUserInterface.spectatorNotificationsEnabled.label',
          control: { kind: 'toggle', key: 'spectatorNotificationsEnabled' },
          dependsOn: 'notificationsEnabled',
        },
        {
          id: 'buddyConnectNotificationsEnabled',
          labelKey: 'SettingsUserInterface.buddyConnectNotificationsEnabled.label',
          control: { kind: 'toggle', key: 'buddyConnectNotificationsEnabled' },
          dependsOn: 'notificationsEnabled',
        },
        {
          id: 'browserNotifications',
          labelKey: 'SettingsUserInterface.browserNotifications.label',
          descriptionKey: 'SettingsUserInterface.browserNotifications.description',
          control: { kind: 'custom', component: NotificationPermissionControl },
        },
      ],
    },
    {
      id: 'userInterface.animation',
      titleKey: 'SettingsUserInterface.group.animation',
      entries: [
        {
          id: 'tapAnimation',
          labelKey: 'SettingsUserInterface.tapAnimation.label',
          control: { kind: 'toggle', key: 'tapAnimation' },
        },
      ],
    },
    {
      id: 'userInterface.deckEditor',
      titleKey: 'SettingsUserInterface.group.deckEditor',
      entries: [
        {
          id: 'openDeckInNewTab',
          labelKey: 'SettingsUserInterface.openDeckInNewTab.label',
          descriptionKey: 'SettingsUserInterface.openDeckInNewTab.description',
          control: { kind: 'toggle', key: 'openDeckInNewTab' },
        },
        {
          id: 'commanderSpellbookIntegration',
          labelKey: 'SettingsUserInterface.commanderSpellbookIntegration.label',
          descriptionKey: 'SettingsUserInterface.commanderSpellbookIntegration.description',
          control: {
            kind: 'select',
            key: 'commanderSpellbookIntegration',
            // Desktop's three modes; its selector has no entry for the unprompted default and
            // shows "Disabled" for it, so that state is named here rather than misreported.
            options: [
              {
                value: CommanderSpellbookIntegration.Unprompted,
                labelKey: 'SettingsUserInterface.commanderSpellbookIntegration.unprompted',
              },
              {
                value: CommanderSpellbookIntegration.Disabled,
                labelKey: 'SettingsUserInterface.commanderSpellbookIntegration.disabled',
              },
              {
                value: CommanderSpellbookIntegration.Enabled,
                labelKey: 'SettingsUserInterface.commanderSpellbookIntegration.enabled',
              },
              {
                value: CommanderSpellbookIntegration.Automatic,
                labelKey: 'SettingsUserInterface.commanderSpellbookIntegration.automatic',
              },
            ],
          },
        },
      ],
    },
    {
      id: 'userInterface.replay',
      titleKey: 'SettingsUserInterface.group.replay',
      entries: [
        {
          id: 'replayRewindBufferingMs',
          labelKey: 'SettingsUserInterface.replayRewindBufferingMs.label',
          descriptionKey: 'SettingsUserInterface.replayRewindBufferingMs.description',
          // Desktop's spin box range (user_interface_settings_page.cpp).
          control: {
            kind: 'number',
            key: 'replayRewindBufferingMs',
            min: 0,
            max: 9999,
            unitKey: 'SettingsUserInterface.replayRewindBufferingMs.unit',
          },
        },
      ],
    },
  ],
};
