import { ScryfallImageSize } from '@cockatrice/datatrice';

import { getScryfallUrlByIdOrExactName } from '@app/services';

import type { SeatDeckCard } from './playerBoard.types';

/**
 * The large Scryfall image a deck row's card shows on the board, so a
 * prefetch warms the same URL `Card` later renders: by Scryfall id when the
 * deck has one, otherwise by exact name (a deck without printing ids, such
 * as a plain .cod, has an empty `scryfallId`).
 */
export function deckCardImageUrl(card: Pick<SeatDeckCard, 'scryfallId' | 'name'>): string {
  return getScryfallUrlByIdOrExactName(card, ScryfallImageSize.Large);
}
