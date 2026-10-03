import { Settings2 } from 'lucide-react';

import { Language, LanguageNative } from '@app/types';

import { SettingsSectionId, type SettingsSection } from '../registry';

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
  ],
};
