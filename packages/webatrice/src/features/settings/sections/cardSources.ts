import { Images } from 'lucide-react';

import { CardSourcesSettings } from '@app/feature-widgets/card-import';

import { SettingsSectionId, type SettingsSection } from '../registry';

/**
 * Card Sources page (desktop deck_editor_settings_page.cpp). Desktop's "URL Download Priority"
 * group; the templates live in the card-data tables rather than the settings row, so the editor
 * saves each change itself and "Restore defaults" leaves it alone ("Reset Download URLs" does
 * that). Downloading on the fly is how a browser always loads images, so it has no switch.
 */
export const cardSourcesSection: SettingsSection = {
  id: SettingsSectionId.CardSources,
  titleKey: 'Settings.section.cardSources',
  icon: Images,
  groups: [
    {
      id: 'cardSources.downloads',
      titleKey: 'SettingsCardSources.group.downloads',
      entries: [
        {
          id: 'pictureUrlTemplates',
          labelKey: 'SettingsCardSources.pictureUrls.label',
          descriptionKey: 'SettingsCardSources.pictureUrls.description',
          control: { kind: 'custom', component: CardSourcesSettings, layout: 'block' },
        },
      ],
    },
  ],
};
