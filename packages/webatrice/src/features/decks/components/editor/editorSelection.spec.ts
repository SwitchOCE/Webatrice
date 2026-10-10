import type { DeckCard } from '../../types';
import { dockColorIdentity, inspectedRow, resolveInspectedRow } from './editorSelection';

const card = (name: string, category: DeckCard['category'] = 'main', extra: Partial<DeckCard> = {}): DeckCard =>
  ({ name, quantity: 1, category, lookupSource: 'scryfall', ...extra });

describe('resolveInspectedRow', () => {
  const cards = [
    card('Sol Ring', 'main', { scryfallId: 'sr-c21' }),
    card('Sol Ring', 'main', { scryfallId: 'sr-lea' }),
    card('Sol Ring', 'sideboard'),
    card('Ponder', 'sideboard'),
  ];
  const preview = card('Sol Ring');

  it('resolves a deck selection to exactly its zone, name and printing', () => {
    expect(resolveInspectedRow(cards, inspectedRow(cards[1]))).toBe(1);
    expect(resolveInspectedRow(cards, { name: 'sol ring', category: 'sideboard' })).toBe(2);
    expect(resolveInspectedRow(cards, { name: 'Sol Ring', category: 'main', scryfallId: 'sr-foil' })).toBe(-1);
    expect(resolveInspectedRow(cards, { name: 'Ponder', category: 'main' })).toBe(-1);
    expect(resolveInspectedRow(cards, null)).toBe(-1);
  });

  it('lets a search pick fall back from its printing to any copy of the card', () => {
    expect(resolveInspectedRow(cards, { name: 'Sol Ring', category: 'main', scryfallId: 'sr-lea', preview })).toBe(1);
    expect(resolveInspectedRow(cards, { name: 'Sol Ring', category: 'main', scryfallId: 'sr-foil', preview })).toBe(0);
    expect(resolveInspectedRow(cards, { name: 'Sol Ring', category: 'main', preview })).toBe(0);
    expect(resolveInspectedRow(cards, { name: 'Ponder', category: 'main', preview })).toBe(3);
    expect(resolveInspectedRow(cards, { name: 'Brainstorm', category: 'main', preview })).toBe(-1);
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

  it('prefers colour identity over colours, and treats a known colourless identity as colourless', () => {
    const commander = card('Kozilek', 'main', { isCommander: true, colors: [], colorIdentity: [] });
    const hybrid = card('Tasigur', 'main', { isCommander: true, colors: ['B'], colorIdentity: ['B', 'G', 'U'] });
    expect(dockColorIdentity([hybrid, card('Bolt', 'main', { colors: ['R'] })], true)).toEqual(['U', 'B', 'G']);
    expect(dockColorIdentity([commander, card('Bolt', 'main', { colors: ['R'] })], true)).toEqual([]);
  });
});
