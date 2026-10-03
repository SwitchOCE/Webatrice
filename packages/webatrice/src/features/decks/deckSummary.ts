import { MTG_FORMAT_LABELS, MTG_FORMATS, normalizeFormat, type ParsedDeck } from '@app/types';

import type { FlatDeck } from './deckTree';

/**
 * Per-deck summary for the MyDecks list. Servatrice's deck tree carries
 * only `{ id, name, creationTime }`, so the list downloads each deck and
 * plucks these fields out of its `.cod`. Drives the price badge, bracket
 * badge, format section and the row art.
 */
export interface DeckSummary {
  usd?: number;
  missing?: number;
  /** Assessed commander bracket 1..5, from either the
   *  `<bracketAssessment>` element or the legacy meta blob. */
  bracketLevel?: number;
  /** `<format>` element — used for the format label chip. */
  format?: string;
  /** `<bannerCard>` element — Cockatrice's "featured card" for the
   *  deck. Wins over the commander art. Just a card name (no
   *  scryfallId), so art resolves via Scryfall's `/cards/named`. */
  bannerCard?: string;
  /** First commander-marked card's name — art fallback when there's no
   *  scryfallId hint on the card. */
  commanderName?: string;
  /** First commander-marked card's scryfallId — preferred because it
   *  resolves to the exact chosen printing's art. */
  commanderScryfallId?: string;
}

export function summarizeDeck(parsed: ParsedDeck): DeckSummary {
  const commander = parsed.cards.find((c) => c.isCommander);
  return {
    usd: parsed.meta.priceUsd,
    missing: parsed.meta.priceMissingCount,
    // Prefer the richer <bracketAssessment> level (matches what the
    // GameLobby reads); fall back to meta.bracketLevel for decks last
    // saved before the element existed.
    bracketLevel: parsed.bracketAssessment?.level ?? parsed.meta.bracketLevel,
    format: parsed.format || undefined,
    bannerCard: parsed.bannerCard,
    commanderName: commander?.name,
    commanderScryfallId: commander?.scryfallId,
  };
}

export function summariesEqual(a: DeckSummary, b: DeckSummary): boolean {
  return (
    a.usd === b.usd &&
    a.missing === b.missing &&
    a.bracketLevel === b.bracketLevel &&
    a.format === b.format &&
    a.bannerCard === b.bannerCard &&
    a.commanderName === b.commanderName &&
    a.commanderScryfallId === b.commanderScryfallId
  );
}

/**
 * Background art for a deck row:
 *   1. `<bannerCard>` → Scryfall `/cards/named?exact=…` (name-based).
 *   2. Commander card's `scryfallId` → `/cards/:uuid` (exact printing).
 *   3. Commander card's name → `/cards/named?exact=…`.
 *   4. Nothing → `null` (row renders the placeholder gradient).
 * `format=image&version=art_crop` returns a frameless landscape crop.
 */
export function deckArtUrl(s: DeckSummary | undefined): string | null {
  if (!s) {
    return null;
  }
  if (s.bannerCard && s.bannerCard.trim()) {
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(s.bannerCard.trim())}&format=image&version=art_crop`;
  }
  if (s.commanderScryfallId) {
    return `https://api.scryfall.com/cards/${encodeURIComponent(s.commanderScryfallId)}?format=image&version=art_crop`;
  }
  if (s.commanderName && s.commanderName.trim()) {
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(s.commanderName.trim())}&format=image&version=art_crop`;
  }
  return null;
}

/** A format slug's display label; custom formats keep their own text, capitalised. */
export function formatDisplayLabel(format: string): string {
  const known = MTG_FORMAT_LABELS.find((f) => f.value === normalizeFormat(format));
  if (known) {
    return known.label;
  }
  return format.replace(/^\w/, (c) => c.toUpperCase());
}

// ---------- Format sections ----------

/** Non-MTG custom format. */
export const SECTION_OTHER = 'other';
/** Deck XML hasn't landed yet, so its format is unknown for now. */
export const SECTION_LOADING = 'loading';
/** Deck fetched, but its `<format>` was empty or missing. */
export const SECTION_UNKNOWN = 'unknown';

const SECTION_LABELS: Record<string, string> = {
  ...Object.fromEntries(MTG_FORMAT_LABELS.map((f) => [f.value, f.label])),
  [SECTION_OTHER]: 'Other',
  [SECTION_LOADING]: 'Loading…',
  [SECTION_UNKNOWN]: 'Unknown format',
};

export function deckSectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? section;
}

/**
 * Section slug for a deck: LOADING without a summary, UNKNOWN for an
 * empty format, the slug for a known MTG format, OTHER for anything else.
 */
export function deckListSectionOf(summary: DeckSummary | undefined): string {
  if (!summary) {
    return SECTION_LOADING;
  }
  const n = normalizeFormat(summary.format ?? '');
  if (!n) {
    return SECTION_UNKNOWN;
  }
  if (MTG_FORMATS.includes(n)) {
    return n;
  }
  return SECTION_OTHER;
}

export interface DeckListSection {
  section: string;
  decks: FlatDeck[];
}

/**
 * Bucket decks by format, ordered: MTG formats in `MTG_FORMAT_LABELS`
 * order, then Other, Loading, Unknown. Decks keep their incoming order
 * (newest first) inside each section.
 */
export function groupDecksByFormat(
  decks: FlatDeck[],
  summaries: ReadonlyMap<number, DeckSummary>,
): DeckListSection[] {
  const groups = new Map<string, FlatDeck[]>();
  for (const deck of decks) {
    const section = deckListSectionOf(summaries.get(deck.id));
    const bucket = groups.get(section) ?? [];
    bucket.push(deck);
    groups.set(section, bucket);
  }
  const order: string[] = MTG_FORMAT_LABELS.map((f) => f.value);
  order.push(SECTION_OTHER, SECTION_LOADING, SECTION_UNKNOWN);
  return order
    .filter((section) => groups.has(section))
    .map((section) => ({ section, decks: groups.get(section)! }));
}
