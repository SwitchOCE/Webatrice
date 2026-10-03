import type { BracketAssessment, DeckCategory } from '@app/types';

import type { DeckCard, HydratedDeck } from './types';

/**
 * Pure deck-editor transitions. Each takes the current deck and returns
 * the next one — the same object when nothing changes, so React can
 * skip the render. `useDeckEditor` applies them optimistically and
 * schedules the autosave; keeping them pure leaves room for undo/redo.
 */

export function renameDeck(deck: HydratedDeck, name: string): HydratedDeck {
  return { ...deck, name };
}

/** Any format string — known MTG slug or a custom label. */
export function setDeckFormat(deck: HydratedDeck, format: string): HydratedDeck {
  return { ...deck, format };
}

export function setDeckDescription(deck: HydratedDeck, description: string): HydratedDeck {
  return { ...deck, meta: { ...deck.meta, description: description || undefined } };
}

/** Cache the deck's computed price; a no-op when the values already match. */
export function setDeckPriceCache(
  deck: HydratedDeck,
  priceUsd: number | undefined,
  priceMissingCount: number | undefined,
): HydratedDeck {
  if (deck.meta.priceUsd === priceUsd && deck.meta.priceMissingCount === priceMissingCount) {
    return deck;
  }
  return { ...deck, meta: { ...deck.meta, priceUsd, priceMissingCount } };
}

/**
 * Cache a bracket assessment in `<bracketAssessment>` and mirror its level
 * into `meta.bracketLevel` for consumers that only read the JSON blob.
 * `undefined` clears both. A no-op when level and fingerprint match what
 * the deck already carries (a reopened deck replays the same result).
 */
export function setDeckBracketAssessment(
  deck: HydratedDeck,
  assessment: BracketAssessment | undefined,
): HydratedDeck {
  if (
    deck.meta.bracketLevel === assessment?.level
    && deck.bracketAssessment?.fingerprint === assessment?.fingerprint
  ) {
    return deck;
  }
  return {
    ...deck,
    meta: { ...deck.meta, bracketLevel: assessment?.level },
    bracketAssessment: assessment,
  };
}

function withCards(deck: HydratedDeck, edit: (cards: DeckCard[]) => void): HydratedDeck {
  const cards = deck.cards.slice();
  edit(cards);
  return { ...deck, cards };
}

export function patchCard(deck: HydratedDeck, index: number, patch: Partial<DeckCard>): HydratedDeck {
  return withCards(deck, (cards) => {
    cards[index] = { ...cards[index], ...patch };
  });
}

export function removeCard(deck: HydratedDeck, index: number): HydratedDeck {
  return withCards(deck, (cards) => {
    cards.splice(index, 1);
  });
}

/** Change a row's quantity by `delta`; the row is removed at zero or below. */
export function adjustCardQuantity(deck: HydratedDeck, index: number, delta: number): HydratedDeck {
  return withCards(deck, (cards) => {
    const nextQty = cards[index].quantity + delta;
    if (nextQty <= 0) {
      cards.splice(index, 1);
    } else {
      cards[index] = { ...cards[index], quantity: nextQty };
    }
  });
}

export function setCardCategory(deck: HydratedDeck, index: number, category: DeckCategory): HydratedDeck {
  return patchCard(deck, index, { category });
}

/**
 * Toggle the commander marker. Independent of category — the card stays
 * in its zone. Marking clamps the quantity to 1 (one copy of the
 * commander). A no-op for an index outside the deck.
 */
export function setCardCommander(deck: HydratedDeck, index: number, isCommander: boolean): HydratedDeck {
  const current = deck.cards[index];
  if (!current) {
    return deck;
  }
  return patchCard(deck, index, {
    isCommander,
    quantity: isCommander ? 1 : current.quantity,
  });
}

export function appendCard(deck: HydratedDeck, card: DeckCard): HydratedDeck {
  return { ...deck, cards: [...deck.cards, card] };
}

/**
 * The name a typed or suggested card is stored under. Scryfall's
 * autocomplete returns MDFC / transform cards as "A // B"; the deck
 * keeps the front face, which both the Dexie cards table and Scryfall's
 * exact-name lookup resolve to the same record.
 */
export function normalizeAddedCardName(name: string): string {
  return name.trim().split(' // ')[0].trim();
}

/**
 * Index of the mainboard row for `name` (case-insensitive), or -1. Adding
 * a card that already has one increments it — one row per (name, zone).
 */
export function findMainboardRow(deck: HydratedDeck, name: string): number {
  const lower = name.toLowerCase();
  return deck.cards.findIndex((c) => c.category === 'main' && c.name.toLowerCase() === lower);
}
