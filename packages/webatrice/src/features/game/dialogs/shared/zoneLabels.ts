import type { TFunction } from 'i18next';
import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';

/** How a zone's name is written: alone, as in a heading ("Graveyard"), or inside a sentence ("graveyard"). */
export type ZoneLabelForm = 'title' | 'inline';

/** Every wire zone's name, as i18n keys. */
export const ZONE_LABEL_KEYS: Record<ZoneNameValue, Record<ZoneLabelForm, string>> = {
  [ZoneName.TABLE]: { title: 'ZoneLabel.title.table', inline: 'ZoneLabel.inline.table' },
  [ZoneName.GRAVE]: { title: 'ZoneLabel.title.grave', inline: 'ZoneLabel.inline.grave' },
  [ZoneName.EXILE]: { title: 'ZoneLabel.title.rfg', inline: 'ZoneLabel.inline.rfg' },
  [ZoneName.HAND]: { title: 'ZoneLabel.title.hand', inline: 'ZoneLabel.inline.hand' },
  [ZoneName.DECK]: { title: 'ZoneLabel.title.deck', inline: 'ZoneLabel.inline.deck' },
  [ZoneName.SIDEBOARD]: { title: 'ZoneLabel.title.sb', inline: 'ZoneLabel.inline.sb' },
  [ZoneName.STACK]: { title: 'ZoneLabel.title.stack', inline: 'ZoneLabel.inline.stack' },
};

/** A zone's translated name; a zone the protocol doesn't define shows its wire name. */
export function zoneLabel(t: TFunction, zoneName: string | undefined, form: ZoneLabelForm = 'title'): string {
  const keys = ZONE_LABEL_KEYS[zoneName as ZoneNameValue] as Record<ZoneLabelForm, string> | undefined;
  return keys ? t(keys[form]) : zoneName ?? '';
}
