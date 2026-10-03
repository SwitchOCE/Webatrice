import type { BracketAssessment } from '@app/types';

import {
  adjustCardQuantity,
  appendCard,
  findMainboardRow,
  normalizeAddedCardName,
  patchCard,
  removeCard,
  renameDeck,
  setCardCategory,
  setCardCommander,
  setDeckBracketAssessment,
  setDeckDescription,
  setDeckFormat,
  setDeckPriceCache,
} from './deckEdits';
import type { DeckCard, HydratedDeck } from './types';

function card(name: string, overrides: Partial<DeckCard> = {}): DeckCard {
  return { name, quantity: 1, category: 'main', lookupSource: 'scryfall', ...overrides };
}

function deck(cards: DeckCard[] = []): HydratedDeck {
  return { name: 'Deck', meta: { v: 1, updatedAt: 'x' }, cards, format: 'commander' };
}

const assessment = (level: 1 | 2 | 3 | 4 | 5, fingerprint: string): BracketAssessment => ({
  level, fingerprint, gameChangers: [], turns: [], turnsRestricted: [],
  denial: [], denialRestricted: [], earlyCombos: [], lateCombos: [],
});

describe('deck metadata edits', () => {
  it('renames, reformats and describes without mutating the input', () => {
    const before = deck();
    expect(renameDeck(before, 'New').name).toBe('New');
    expect(setDeckFormat(before, 'Cube').format).toBe('Cube');
    expect(setDeckDescription(before, 'notes').meta.description).toBe('notes');
    expect(setDeckDescription(before, '').meta.description).toBeUndefined();
    expect(before).toEqual(deck());
  });

  it('caches a price and returns the same deck when it is unchanged', () => {
    const priced = setDeckPriceCache(deck(), 12.5, 2);
    expect(priced.meta).toEqual(expect.objectContaining({ priceUsd: 12.5, priceMissingCount: 2 }));
    expect(setDeckPriceCache(priced, 12.5, 2)).toBe(priced);
  });

  it('caches a bracket assessment, mirrors its level, and clears both on undefined', () => {
    const assessed = setDeckBracketAssessment(deck(), assessment(3, 'abc'));
    expect(assessed.meta.bracketLevel).toBe(3);
    expect(assessed.bracketAssessment?.fingerprint).toBe('abc');
    expect(setDeckBracketAssessment(assessed, assessment(3, 'abc'))).toBe(assessed);

    const cleared = setDeckBracketAssessment(assessed, undefined);
    expect(cleared.meta.bracketLevel).toBeUndefined();
    expect(cleared.bracketAssessment).toBeUndefined();
  });
});

describe('card edits', () => {
  const base = deck([card('A', { quantity: 2 }), card('B')]);

  it('patches, recategorizes and removes a row by index', () => {
    expect(patchCard(base, 1, { set: 'lea' }).cards[1].set).toBe('lea');
    expect(setCardCategory(base, 0, 'sideboard').cards[0].category).toBe('sideboard');
    expect(removeCard(base, 0).cards.map((c) => c.name)).toEqual(['B']);
    expect(base.cards.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('adjusts quantity and drops the row at zero', () => {
    expect(adjustCardQuantity(base, 0, 1).cards[0].quantity).toBe(3);
    expect(adjustCardQuantity(base, 1, -1).cards.map((c) => c.name)).toEqual(['A']);
  });

  it('marks a commander with one copy and leaves the quantity when unmarking', () => {
    const marked = setCardCommander(base, 0, true);
    expect(marked.cards[0]).toEqual(expect.objectContaining({ isCommander: true, quantity: 1 }));
    expect(setCardCommander(base, 0, false).cards[0]).toEqual(expect.objectContaining({ isCommander: false, quantity: 2 }));
    expect(setCardCommander(base, 9, true)).toBe(base);
  });

  it('appends a new row', () => {
    expect(appendCard(base, card('C')).cards.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('adding by name', () => {
  it('stores the front face of a double-faced name', () => {
    expect(normalizeAddedCardName('  Riverglide Pathway // Lavaglide Pathway ')).toBe('Riverglide Pathway');
    expect(normalizeAddedCardName(' Sol Ring ')).toBe('Sol Ring');
  });

  it('finds an existing mainboard row case-insensitively, ignoring the sideboard', () => {
    const d = deck([card('Negate', { category: 'sideboard' }), card('Sol Ring')]);
    expect(findMainboardRow(d, 'sol ring')).toBe(1);
    expect(findMainboardRow(d, 'Negate')).toBe(-1);
  });
});
