import type { TFunction } from 'i18next';

/**
 * Format string as stored in the .cod `<format>` element. Free-form
 * strings so we can round-trip custom / non-MTG formats without
 * mangling them, but we recognize a handful of known MTG values to
 * gate MTG-specific UI (category grouping, printings picker, pricing).
 */
export type DeckFormat = string;

export type DeckFormatFamily = 'commander' | 'modern' | 'standard' | 'eternal' | 'pauper' | 'other';

/**
 * MTG formats we know about, with the display label the UI renders.
 * Ordered to put commander-family formats first (most common in
 * casual play), then Standard-and-adjacent, then eternal formats,
 * then digital-only / online-first at the tail. Anything outside this
 * list is treated as a non-MTG "Other" deck (custom label allowed).
 *
 * `value` is the canonical lowercase slug stored in the .cod
 * `<format>` element — matches Cockatrice desktop's convention.
 */
export const MTG_FORMAT_LABELS: ReadonlyArray<{
  value: string;
  label: (t: TFunction) => string;
  family: DeckFormatFamily;
}> = [
  { value: 'commander', label: (t) => t('DeckFormat.commander'), family: 'commander' },
  { value: 'paupercommander', label: (t) => t('DeckFormat.paupercommander'), family: 'commander' },
  { value: 'duel', label: (t) => t('DeckFormat.duel'), family: 'commander' },
  { value: 'oathbreaker', label: (t) => t('DeckFormat.oathbreaker'), family: 'commander' },
  { value: 'standard', label: (t) => t('DeckFormat.standard'), family: 'standard' },
  { value: 'pioneer', label: (t) => t('DeckFormat.pioneer'), family: 'modern' },
  { value: 'modern', label: (t) => t('DeckFormat.modern'), family: 'modern' },
  { value: 'legacy', label: (t) => t('DeckFormat.legacy'), family: 'eternal' },
  { value: 'vintage', label: (t) => t('DeckFormat.vintage'), family: 'eternal' },
  { value: 'pauper', label: (t) => t('DeckFormat.pauper'), family: 'pauper' },
  { value: 'premodern', label: (t) => t('DeckFormat.premodern'), family: 'eternal' },
  { value: 'oldschool', label: (t) => t('DeckFormat.oldschool'), family: 'eternal' },
  { value: 'predh', label: (t) => t('DeckFormat.predh'), family: 'commander' },
  { value: 'penny', label: (t) => t('DeckFormat.penny'), family: 'other' },
  { value: 'standardbrawl', label: (t) => t('DeckFormat.standardbrawl'), family: 'commander' },
  { value: 'historic', label: (t) => t('DeckFormat.historic'), family: 'modern' },
  { value: 'timeless', label: (t) => t('DeckFormat.timeless'), family: 'modern' },
  { value: 'gladiator', label: (t) => t('DeckFormat.gladiator'), family: 'other' },
  { value: 'future', label: (t) => t('DeckFormat.future'), family: 'modern' },
];

/** Value-only list, derived from `MTG_FORMAT_LABELS`. Used for the
 *  `isMtgFormat` membership check. */
export const MTG_FORMATS: readonly string[] = MTG_FORMAT_LABELS.map((f) => f.value);

/** Formats that use the "designate a commander" affordance in the
 *  editor — Commander proper and Pauper Commander (same rules, common
 *  restriction). Kept as its own list so callers can extend without
 *  touching `isCommanderFormat` logic. */
export const COMMANDER_FORMATS: readonly string[] = ['commander', 'paupercommander'];

export function normalizeFormat(f: string | undefined | null): string {
  return (f ?? '').trim().toLowerCase();
}

export function isMtgFormat(f: string | undefined | null): boolean {
  return MTG_FORMATS.includes(normalizeFormat(f));
}

export function isCommanderFormat(f: string | undefined | null): boolean {
  return COMMANDER_FORMATS.includes(normalizeFormat(f));
}
