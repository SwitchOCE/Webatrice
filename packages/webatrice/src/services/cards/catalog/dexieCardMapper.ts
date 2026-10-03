import { ScryfallImageSize } from '@cockatrice/datatrice';

import { resolvePrintingImageUrls, sortBySetPreference, type CardDataPreferences } from '../../cardDatabase';
import { dexieService, type Card, type CardInSet, type RelatedCard } from '../../dexie';
import { getScryfallUrlById } from '../../scryfall';
import type { LookupResult, PrintingSummary, RelatedCardRef } from './types';

/**
 * The Dexie `cards` table (the user's imported Cockatrice cards.xml) read
 * as `LookupResult`s. cards.xml records are Cockatrice-XML-shaped
 * ({value, ...attrs} leaves, nested `prop`, single repeated tags
 * collapsed to a scalar) and keyed by `name.value`.
 */

export async function getFromDexie(name: string): Promise<Card | undefined> {
  try {
    return (await dexieService.cards.get(name)) as Card | undefined;
  } catch {
    return undefined;
  }
}

export async function bulkGetFromDexie(names: string[]): Promise<Array<Card | undefined>> {
  try {
    return (await dexieService.cards.bulkGet(names)) as Array<Card | undefined>;
  } catch {
    return names.map(() => undefined);
  }
}

export function dexieToLookup(card: Card, preferences?: CardDataPreferences): LookupResult {
  const prop = card.prop?.value ?? {};
  // Printings follow the user's set priority (Manage Sets), so the first
  // one — the default art wherever a printing isn't pinned — is theirs.
  const sets = preferences
    ? sortBySetPreference(normalizeSets(card.set), (s) => s.value, preferences.setPreferences)
    : normalizeSets(card.set);
  const printings: PrintingSummary[] = sets.map((s) => ({
    set: s.value || undefined,
    collectorNumber: s.num,
    scryfallId: s.uuid,
    imageUri: pickImageUri(card, s, preferences),
  }));

  // Cockatrice merges related + reverse-related into one flat list
  // (card_info.h:249 `getAllRelatedCards`). Keeping the origin lets
  // callers filter if they want, but the default menu render treats
  // both directions the same. Dedupe by name so a card that appears
  // in both directions doesn't render twice.
  //
  // Both fields go through normalizeRelated because the Cockatrice
  // XML parser collapses single-occurrence repeated tags to a scalar
  // object rather than a one-element array (see
  // CockatriceXmlParser.parseElement lines 95-101). A card with a
  // single `<related>Bird</related>` (Swan Song) lands as
  // `related: {value: "Bird"}` — iterating that as an array of
  // RelatedCard would silently produce zero token items.
  const relatedList: RelatedCardRef[] = [];
  const seenNames = new Set<string>();
  for (const entry of normalizeRelated(card.related)) {
    if (!entry.value || seenNames.has(entry.value)) {
      continue;
    }
    seenNames.add(entry.value);
    relatedList.push({
      name: entry.value,
      count: entry.count,
      attach: entry.attach,
      persistent: entry.persistent,
      origin: 'related',
    });
  }
  for (const entry of normalizeRelated(card['reverse-related'])) {
    if (!entry.value || seenNames.has(entry.value)) {
      continue;
    }
    seenNames.add(entry.value);
    relatedList.push({
      name: entry.value,
      count: entry.count,
      attach: entry.attach,
      persistent: entry.persistent,
      origin: 'reverse-related',
    });
  }

  return {
    found: true,
    source: 'dexie',
    name: card.name.value,
    typeLine: readStringProp(prop.type),
    manaCost: readStringProp(prop.manacost),
    cmc: readNumberProp(prop.cmc),
    colors: splitColors(readStringProp(prop.colors) ?? readStringProp(prop.coloridentity)),
    power: readStringProp(prop.power),
    toughness: readStringProp(prop.toughness),
    printings,
    related: relatedList.length > 0 ? relatedList : undefined,
    text: card.text?.value || undefined,
    properties: readProperties(prop),
    legalities: readLegalities(prop),
  };
}

function readProperties(prop: Record<string, { value?: unknown } | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, node] of Object.entries(prop)) {
    if (typeof node?.value === 'string') {
      out[key] = node.value;
    }
  }
  return out;
}

/** cards.xml `format-<name>` props; `undefined` when the card has none. */
function readLegalities(prop: Record<string, { value?: unknown } | undefined>): Record<string, string> | undefined {
  let out: Record<string, string> | undefined;
  for (const [key, node] of Object.entries(prop)) {
    if (key.startsWith('format-') && typeof node?.value === 'string') {
      out ??= {};
      out[key.slice('format-'.length)] = node.value;
    }
  }
  return out;
}

function pickImageUri(
  card: Card,
  printing: CardInSet,
  preferences: CardDataPreferences | undefined,
): string | undefined {
  // The printing's own picurl (self-hosted mirrors), then the user's picture
  // URL templates; without preferences, fall back to Scryfall by UUID.
  if (preferences) {
    const [first] = resolvePrintingImageUrls(card, printing, {
      templates: preferences.pictureUrlTemplates,
      setLongNames: preferences.setLongNames,
    });
    if (first) {
      return first;
    }
  }
  if (printing.picurl) {
    return printing.picurl;
  }
  if (printing.picURL) {
    return printing.picURL;
  }
  if (printing.uuid) {
    return getScryfallUrlById(printing.uuid, ScryfallImageSize.Small);
  }
  return undefined;
}

function normalizeSets(setField: CardInSet | CardInSet[] | undefined): CardInSet[] {
  // Cockatrice XML collapses single-element repeated tags to a
  // scalar; `set` can be one printing or many. Signature is broader
  // than Card['set'] so token records (whose `set` is optional) can
  // reuse the same helper.
  if (!setField) {
    return [];
  }
  return Array.isArray(setField) ? setField : [setField];
}

// Same collapse quirk as `normalizeSets` — the Card type declares
// `related?: RelatedCard[]` but the XML parser produces a single
// object when there's only one `<related>` sibling. Cast is safe
// because the parser always yields objects with `.value` even when
// it lies about the collection shape.
function normalizeRelated(
  field: RelatedCard[] | RelatedCard | undefined,
): RelatedCard[] {
  if (!field) {
    return [];
  }
  return Array.isArray(field) ? field : [field];
}

function readStringProp(node: unknown): string | undefined {
  if (isRecord(node) && typeof node.value === 'string') {
    const s = node.value.trim();
    return s || undefined;
  }
  return undefined;
}

function readNumberProp(node: unknown): number | undefined {
  const s = readStringProp(node);
  if (!s) {
    return undefined;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function splitColors(raw: string | undefined): string[] | undefined {
  if (!raw) {
    return undefined;
  }
  // Cockatrice packs colors as "W" / "WU" / "WUBRG". Split on chars.
  const out = raw
    .toUpperCase()
    .split('')
    .filter((c) => c === 'W' || c === 'U' || c === 'B' || c === 'R' || c === 'G');
  return out.length ? out : undefined;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
