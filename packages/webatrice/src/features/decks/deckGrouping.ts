import { primaryType, type DeckCard } from './types';

/**
 * Deck-editor section order: the standard MTG supertype buckets, with
 * the commander first and the sideboard last.
 */
export const DECK_SECTION_ORDER = [
  'Commander',
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Land',
  'Other',
  'Sideboard',
] as const;

export type DeckSection = typeof DECK_SECTION_ORDER[number];

/**
 * A rendered section: its label plus indices into the deck's `cards`
 * array. Indices (not copies) keep the row → mutation contract intact:
 * every row action addresses the card by its position in the deck.
 */
export interface DeckCardGroup {
  label: DeckSection;
  indices: number[];
}

/**
 * The section a card renders under. The "Commander" section only exists
 * for commander-format decks: if a deck was commander and got switched to
 * (say) Modern, commander-marked cards fall back to their type bucket
 * rather than lingering under a phantom header. The `commander="1"`
 * attribute stays in the XML, so switching back restores the grouping.
 */
export function deckSectionOf(card: DeckCard, isCommanderDeck: boolean): DeckSection {
  if (isCommanderDeck && card.isCommander) {
    return 'Commander';
  }
  if (card.category === 'sideboard') {
    return 'Sideboard';
  }
  return primaryType(card.typeLine);
}

/**
 * Sort deck indices alphabetically by card name (case-insensitive,
 * locale-aware) — Moxfield-style ordering. Sorts in place and returns
 * the same array.
 */
export function sortIndicesByName(cards: DeckCard[], indices: number[]): number[] {
  return indices.sort((a, b) =>
    cards[a].name.localeCompare(cards[b].name, undefined, { sensitivity: 'base' }),
  );
}

/** Group a deck into its non-empty sections, in `DECK_SECTION_ORDER`. */
export function groupDeckCards(cards: DeckCard[], isCommanderDeck: boolean): DeckCardGroup[] {
  const map = new Map<DeckSection, number[]>();
  cards.forEach((card, index) => {
    const label = deckSectionOf(card, isCommanderDeck);
    const bucket = map.get(label) ?? [];
    bucket.push(index);
    map.set(label, bucket);
  });
  return DECK_SECTION_ORDER
    .map((label) => ({ label, indices: sortIndicesByName(cards, map.get(label) ?? []) }))
    .filter((g) => g.indices.length > 0);
}

/**
 * Header counts: mainboard total (commander included — it lives in
 * main) and sideboard total.
 */
export function countDeckCards(cards: DeckCard[] | undefined): {
  totalMainboardCount: number;
  totalSideboardCount: number;
} {
  let main = 0;
  let side = 0;
  for (const c of cards ?? []) {
    if (c.category === 'sideboard') {
      side += c.quantity;
    } else {
      main += c.quantity;
    }
  }
  return { totalMainboardCount: main, totalSideboardCount: side };
}
