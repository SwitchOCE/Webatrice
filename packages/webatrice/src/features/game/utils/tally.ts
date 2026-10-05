import type { TFunction } from 'i18next';

// Tallies over the selected cards, ported from desktop's tally overlay
// (game_graphics/tally/, Cockatrice 3.1). Pure: callers resolve the cards and
// their type lines.

export type TallyType = 'none' | 'subtypes' | 'power' | 'toughness';

export const TALLY_TYPES: readonly TallyType[] = ['none', 'subtypes', 'power', 'toughness'];

export interface TallyRow {
  name: string;
  value: string;
}

export interface TallyCard {
  name: string;
  /** The live P/T (`AttrPT`), e.g. "3/1"; empty when the card has none. */
  pt: string;
  faceDown: boolean;
}

/** Qt's QString::toInt: a whole, optionally signed integer, else 0. */
function toInt(text: string | undefined): number {
  return text != null && /^\s*[+-]?\d+\s*$/.test(text) ? parseInt(text, 10) : 0;
}

/** P and T of a P/T string, as desktop CardItem::parsePT reads them. */
function parsePT(pt: string): { power?: number; toughness?: number } {
  if (!pt) {
    return {};
  }
  // A leading "/" means the whole rest is one value (card_item.cpp:420-421).
  if (pt.startsWith('/')) {
    return { power: toInt(pt.slice(1)) };
  }
  const parts = pt.split('/');
  return {
    power: toInt(parts[0]),
    toughness: parts.length === 2 ? toInt(parts[1]) : undefined,
  };
}

/** Subtypes of one face's type line: the words after " — " (subtype_tally.cpp). */
function faceSubtypes(faceType: string): string[] {
  const parts = faceType.split(' — ');
  return parts.length > 1 ? parts[1].split(' ').filter((w) => w.length > 0) : [];
}

function countSubtypes(cards: readonly TallyCard[], typeLineOf: (name: string) => string | undefined): TallyRow[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (card.faceDown || !card.name) {
      continue;
    }
    // Double-faced cards: "Creature — Human // Creature — Werewolf".
    for (const face of (typeLineOf(card.name) ?? '').split(' // ')) {
      for (const subtype of faceSubtypes(face)) {
        counts.set(subtype, (counts.get(subtype) ?? 0) + 1);
      }
    }
  }
  // Count ascending, then name, as desktop sorts them.
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => a.count - b.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name, count }) => ({ name, value: String(count) }));
}

function total(cards: readonly TallyCard[], name: string, pick: (pt: ReturnType<typeof parsePT>) => number | undefined): TallyRow[] {
  // No rows unless some card has a P/T (stats_tally.cpp).
  if (!cards.some((c) => c.pt)) {
    return [];
  }
  const sum = cards.reduce((acc, c) => acc + Math.max(pick(parsePT(c.pt)) ?? 0, 0), 0);
  return [{ name, value: String(sum) }];
}

/** The overlay rows for `type` over `cards` (desktop Tally::compute). */
export function computeTally(
  t: TFunction,
  cards: readonly TallyCard[],
  type: TallyType,
  typeLineOf: (name: string) => string | undefined,
): TallyRow[] {
  switch (type) {
    case 'subtypes':
      return countSubtypes(cards, typeLineOf);
    case 'power':
      return total(cards, t('PlayerMenu.tallyPower'), (pt) => pt.power);
    case 'toughness':
      return total(cards, t('PlayerMenu.tallyToughness'), (pt) => pt.toughness);
    default:
      return [];
  }
}
