/**
 * Deck format values recognised by the deck editor and the game lobby.
 */

/**
 * Format string as stored in the .cod `<format>` element. Free-form
 * strings so we can round-trip custom / non-MTG formats without
 * mangling them, but we recognize a handful of known MTG values to
 * gate MTG-specific UI (category grouping, printings picker, pricing).
 */
export type DeckFormat = string;

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
export const MTG_FORMAT_LABELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'commander', label: 'Commander' },
  { value: 'paupercommander', label: 'Pauper Commander' },
  { value: 'duel', label: 'Duel Commander' },
  { value: 'oathbreaker', label: 'Oathbreaker' },
  { value: 'standard', label: 'Standard' },
  { value: 'pioneer', label: 'Pioneer' },
  { value: 'modern', label: 'Modern' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'pauper', label: 'Pauper' },
  { value: 'premodern', label: 'Premodern' },
  { value: 'oldschool', label: 'Old School' },
  { value: 'predh', label: 'PreDH' },
  { value: 'penny', label: 'Penny Dreadful' },
  { value: 'standardbrawl', label: 'Standard Brawl' },
  { value: 'historic', label: 'Historic' },
  { value: 'timeless', label: 'Timeless' },
  { value: 'gladiator', label: 'Gladiator' },
  { value: 'future', label: 'Future' },
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
