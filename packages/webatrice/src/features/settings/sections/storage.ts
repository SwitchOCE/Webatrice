import { HardDrive } from 'lucide-react';

import {
  ClearCardDataControl,
  ClearScryfallCacheControl,
  PersistentStorageControl,
  StorageUsageControl,
} from '../controls/StorageControls';
import { SettingsSectionId, type SettingsSection } from '../registry';

/**
 * Storage page (desktop storage_settings_page.cpp). Desktop configures picture-cache methods,
 * sizes, TTLs and the data paths of general_settings_page.cpp; a browser keeps everything in the
 * origin's IndexedDB and HTTP cache instead, so this page shows usage and offers the targeted
 * clears and the persistence request that have browser meaning. Card images are served from the
 * browser's HTTP cache, which a page cannot clear.
 */
export const storageSection: SettingsSection = {
  id: SettingsSectionId.Storage,
  titleKey: 'Settings.section.storage',
  icon: HardDrive,
  groups: [
    {
      id: 'storage.usage',
      titleKey: 'SettingsStorage.group.usage',
      entries: [
        {
          id: 'storageUsage',
          labelKey: 'SettingsStorage.usage.label',
          descriptionKey: 'SettingsStorage.usage.description',
          control: { kind: 'custom', component: StorageUsageControl, layout: 'block' },
        },
        {
          id: 'persistentStorage',
          labelKey: 'SettingsStorage.persistent.label',
          descriptionKey: 'SettingsStorage.persistent.description',
          control: { kind: 'custom', component: PersistentStorageControl },
        },
      ],
    },
    {
      id: 'storage.clear',
      titleKey: 'SettingsStorage.group.clear',
      entries: [
        {
          id: 'clearScryfallCache',
          labelKey: 'SettingsStorage.scryfallCache.label',
          descriptionKey: 'SettingsStorage.scryfallCache.description',
          control: { kind: 'custom', component: ClearScryfallCacheControl },
        },
        {
          id: 'clearCardData',
          labelKey: 'SettingsStorage.cardData.label',
          descriptionKey: 'SettingsStorage.cardData.description',
          control: { kind: 'custom', component: ClearCardDataControl },
        },
      ],
    },
  ],
};
