import { ScryfallImageSize } from '@cockatrice/datatrice';

import { getScryfallUrlByName } from '../ScryfallService';
import type { CardInSet, CardProperties, XmlNode } from '../dexie/types';
import { expandPictureUrlTemplate } from './pictureUrlTemplates';
import { sortBySetPreference, type SetPreferenceMap } from './setPriority';

/** The parts of a cards.xml `<card>` (or tokens.xml token) the resolver reads. */
export interface CardImageSubject {
  name?: XmlNode<string>;
  prop?: CardProperties;
  set?: CardInSet | CardInSet[];
}

export interface CardImageOptions {
  templates: readonly string[];
  setPreferences: SetPreferenceMap;
  /** Set code → long name, for `!setname!`. */
  setLongNames?: ReadonlyMap<string, string>;
  /** Printing to try before the user's set priority (desktop: the card's own provider id). */
  preferredSet?: string;
  /** `!sflang!`; defaults to `'en'` until Webatrice has a card-language setting. */
  lang?: string;
  /** Size of the trailing Scryfall by-name fallback. */
  fallbackSize?: ScryfallImageSize;
}

export function printingsOf(card: CardImageSubject): CardInSet[] {
  if (!card.set) {
    return [];
  }
  return Array.isArray(card.set) ? card.set : [card.set];
}

/** `<set>` attributes, with the legacy `picURL` spelling folded into `picurl` like desktop's parser. */
export function printingProperties(printing: CardInSet): Record<string, string> {
  const props: Record<string, string> = {};
  for (const [key, value] of Object.entries(printing)) {
    if (key !== 'value' && typeof value === 'string') {
      props[key === 'picURL' ? 'picurl' : key] = value;
    }
  }
  return props;
}

export function cardProperties(card: CardImageSubject): Record<string, string> {
  const props: Record<string, string> = {};
  for (const [key, node] of Object.entries(card.prop?.value ?? {})) {
    if (typeof node?.value === 'string') {
      props[key] = node.value;
    }
  }
  return props;
}

/**
 * Candidate URLs for one printing, in desktop's `populateSetUrls` order:
 * the printing's own `picurl` first, then every template that resolves.
 */
export function resolvePrintingImageUrls(
  card: CardImageSubject,
  printing: CardInSet | undefined,
  options: Pick<CardImageOptions, 'templates' | 'setLongNames' | 'lang'>,
): string[] {
  const name = card.name?.value ?? '';
  const urls: string[] = [];
  const printingProps = printing ? printingProperties(printing) : {};

  if (printingProps.picurl) {
    urls.push(printingProps.picurl);
  }

  const props = cardProperties(card);
  const set = printing?.value
    ? { code: printing.value, longName: options.setLongNames?.get(printing.value), printing: printingProps }
    : undefined;

  for (const template of options.templates) {
    const url = expandPictureUrlTemplate(template, { name, props, set, lang: options.lang ?? 'en' });
    if (url) {
      urls.push(url);
    }
  }
  return urls;
}

/**
 * Ordered, de-duplicated image candidates for a card: each printing in set
 * priority order (`CardPictureToLoad::extractSetsSorted`), the preferred
 * printing first, then a Scryfall by-name lookup as the browser fallback
 * (see webatrice.instructions.md#protocol-quirks). Callers try them in turn.
 */
export function resolveCardImageUrls(card: CardImageSubject, options: CardImageOptions): string[] {
  const sorted = sortBySetPreference(printingsOf(card), (p) => p.value, options.setPreferences);
  if (options.preferredSet) {
    const index = sorted.findIndex((p) => p.value === options.preferredSet);
    if (index > 0) {
      sorted.unshift(...sorted.splice(index, 1));
    }
  }

  const urls = sorted.length
    ? sorted.flatMap((printing) => resolvePrintingImageUrls(card, printing, options))
    : resolvePrintingImageUrls(card, undefined, options);

  const name = card.name?.value;
  if (name) {
    urls.push(getScryfallUrlByName(name, options.fallbackSize ?? ScryfallImageSize.Normal));
  }
  return [...new Set(urls)];
}
