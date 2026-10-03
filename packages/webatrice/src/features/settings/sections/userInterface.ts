import { MousePointerClick } from 'lucide-react';

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
          id: 'doubleClickToPlay',
          labelKey: 'SettingsUserInterface.doubleClickToPlay.label',
          control: { kind: 'toggle', key: 'doubleClickToPlay' },
        },
        {
          id: 'clickPlaysAllSelected',
          labelKey: 'SettingsUserInterface.clickPlaysAllSelected.label',
          descriptionKey: 'SettingsUserInterface.clickPlaysAllSelected.description',
          control: { kind: 'toggle', key: 'clickPlaysAllSelected' },
        },
        {
          id: 'playToStack',
          labelKey: 'SettingsUserInterface.playToStack.label',
          descriptionKey: 'SettingsUserInterface.playToStack.description',
          control: { kind: 'toggle', key: 'playToStack' },
        },
        {
          id: 'doNotDeleteArrowsInSubPhases',
          labelKey: 'SettingsUserInterface.doNotDeleteArrowsInSubPhases.label',
          descriptionKey: 'SettingsUserInterface.doNotDeleteArrowsInSubPhases.description',
          control: { kind: 'toggle', key: 'doNotDeleteArrowsInSubPhases' },
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
  ],
};
