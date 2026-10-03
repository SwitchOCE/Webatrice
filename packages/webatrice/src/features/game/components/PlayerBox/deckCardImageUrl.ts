import type { DeckCard } from './mockTypes';

/**
 * The large Scryfall image a deck row's card shows on the board, so a
 * prefetch warms the same URL `Card` later renders: by Scryfall id when the
 * deck has one, otherwise by exact name (a deck without printing ids, such
 * as a plain .cod, has an empty `card_scryfall_id`).
 */
export function deckCardImageUrl(card: Pick<DeckCard, 'card_scryfall_id' | 'name'>): string {
  return card.card_scryfall_id
    ? `https://api.scryfall.com/cards/${card.card_scryfall_id}?format=image&version=large`
    : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=large`;
}
