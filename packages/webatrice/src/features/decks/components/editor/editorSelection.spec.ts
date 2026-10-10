import type { DeckCard } from '../../types';
import { dockColorIdentity, isInspectedRow, resolveInspectedRow } from './editorSelection';

const card = (name: string, category: DeckCard['category'] = 'main', extra: Partial<DeckCard> = {}): DeckCard =>
  ({ name, quantity: 1, category, lookupSource: 'scryfall', ...extra });

describe('resolveInspectedRow', () => {
  const cards = [card('Sol Ring'), card('Sol Ring', 'sideboard'), card('Ponder', 'sideboard')];

  it('prefers the row in the selected zone, then any row with that name', () => {
    expect(resolveInspectedRow(cards, { name: 'sol ring', category: 'sideboard' })).toBe(1);
    expect(resolveInspectedRow(cards, { name: 'Ponder', category: 'main' })).toBe(2);
    expect(resolveInspectedRow(cards, { name: 'Brainstorm', category: 'main' })).toBe(-1);
    expect(resolveInspectedRow(cards, null)).toBe(-1);
  });

  it('matches rows by zone and name', () => {
    expect(isInspectedRow(cards[1], { name: 'Sol Ring', category: 'sideboard' })).toBe(true);
    expect(isInspectedRow(cards[0], { name: 'Sol Ring', category: 'sideboard' })).toBe(false);
    expect(isInspectedRow(cards[0], null)).toBe(false);
  });
});

describe('dockColorIdentity', () => {
  it('uses the commanders in a commander deck, and every card otherwise', () => {
    const cards = [
      card('Atraxa', 'main', { isCommander: true, colors: ['g', 'W', 'U', 'B'] }),
      card('Lightning Bolt', 'main', { colors: ['R'] }),
    ];
    expect(dockColorIdentity(cards, true)).toEqual(['W', 'U', 'B', 'G']);
    expect(dockColorIdentity(cards, false)).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(dockColorIdentity([cards[1]], true)).toEqual(['R']);
  });
});
