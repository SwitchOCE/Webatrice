import { parseCod } from '@app/services';

import { exportDeck, exportFileName, toArenaText, toPlainText } from './deckExport';
import type { DeckCard, HydratedDeck } from './types';

function card(name: string, overrides: Partial<DeckCard> = {}): DeckCard {
  return { name, quantity: 1, category: 'main', lookupSource: 'scryfall', ...overrides };
}

const cards: DeckCard[] = [
  card('Atraxa', { isCommander: true, set: 'one', collectorNumber: '196' }),
  card('Lightning Bolt', { quantity: 4, set: 'm11', collectorNumber: '149' }),
  card('Forest', { quantity: 10 }),
  card('Negate', { category: 'sideboard', quantity: 2, set: 'm20' }),
];

describe('toPlainText', () => {
  it('lists the commander once, then the deck and the sideboard', () => {
    expect(toPlainText(cards)).toBe([
      '// Commander', '1 Atraxa', '',
      '// Deck', '4 Lightning Bolt', '10 Forest', '',
      '// Sideboard', '2 Negate',
    ].join('\n'));
  });

  it('omits empty sections without leading blank lines', () => {
    expect(toPlainText([card('Forest')])).toBe('// Deck\n1 Forest');
    expect(toPlainText([])).toBe('');
  });
});

describe('toArenaText', () => {
  it('adds set and collector number only when both are known', () => {
    expect(toArenaText(cards)).toBe([
      'Commander', '1 Atraxa (ONE) 196', '',
      'Deck', '4 Lightning Bolt (M11) 149', '10 Forest', '',
      'Sideboard', '2 Negate',
    ].join('\n'));
  });
});

describe('exportDeck', () => {
  const deck: HydratedDeck = {
    name: 'Superfriends',
    meta: { v: 1, updatedAt: '2026-01-01T00:00:00.000Z', description: 'd' },
    cards,
    format: 'commander',
    bannerCard: 'Atraxa',
    bracketAssessment: {
      level: 3, fingerprint: 'abcdefgh', gameChangers: [], turns: [], turnsRestricted: [],
      denial: [], denialRestricted: [], earlyCombos: [], lateCombos: [],
    },
  };

  it('writes a lossless .cod for Cockatrice, without the cached bracket assessment', () => {
    const parsed = parseCod(exportDeck(deck, 'cockatrice'));
    expect(parsed.name).toBe('Superfriends');
    expect(parsed.format).toBe('commander');
    expect(parsed.bannerCard).toBe('Atraxa');
    expect(parsed.meta.description).toBe('d');
    expect(parsed.cards.find((c) => c.name === 'Atraxa')?.isCommander).toBe(true);
    expect(parsed.bracketAssessment).toBeUndefined();
  });

  it('dispatches the text formats', () => {
    expect(exportDeck(deck, 'plain')).toBe(toPlainText(cards));
    expect(exportDeck(deck, 'arena')).toBe(toArenaText(cards));
  });
});

describe('exportFileName', () => {
  it('slugifies the deck name', () => {
    expect(exportFileName('  Atraxa: Superfriends!! ', 'cod')).toBe('atraxa-superfriends.cod');
    expect(exportFileName('???', 'txt')).toBe('deck.txt');
  });
});
