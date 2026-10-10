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

  it('resolves a search pick without a chosen printing to any copy of the card', () => {
    expect(resolveInspectedRow(cards, { name: 'Sol Ring', category: 'main', preview })).toBe(0);
    expect(resolveInspectedRow(cards, { name: 'Ponder', category: 'main', preview })).toBe(3);
    expect(resolveInspectedRow(cards, { name: 'Brainstorm', category: 'main', preview })).toBe(-1);
  });

  it('keeps a search pick with a printing the deck lacks as a preview, in any zone', () => {
    expect(resolveInspectedRow(cards, { name: 'Sol Ring', category: 'main', scryfallId: 'sr-lea', preview })).toBe(1);
    expect(resolveInspectedRow(cards, { name: 'Sol Ring', category: 'sideboard', scryfallId: 'sr-lea', preview })).toBe(1);
    expect(resolveInspectedRow(cards, { name: 'Sol Ring', category: 'main', scryfallId: 'sr-foil', preview })).toBe(-1);
  });
});

describe('dockColorIdentity', () => {
  const bolt = card('Lightning Bolt', 'main', { colors: ['R'], colorIdentity: ['R'] });

  it('is the commanders\' combined identity, only in commander formats with a commander', () => {
    const atraxa = card('Atraxa', 'main', { isCommander: true, colors: ['g', 'W', 'U', 'B'], colorIdentity: ['g', 'W', 'U', 'B'] });
    const partner = card('Tymna', 'main', { isCommander: true, colors: ['W'], colorIdentity: ['W', 'B'] });
    expect(dockColorIdentity([atraxa, bolt], true)).toEqual(['W', 'U', 'B', 'G']);
    expect(dockColorIdentity([partner, card('Kozilek', 'main', { isCommander: true, colorIdentity: [] }), bolt], true)).toEqual(['W', 'B']);
    expect(dockColorIdentity([atraxa, bolt], false)).toBeUndefined();
    expect(dockColorIdentity([bolt], true)).toBeUndefined();
  });

  it('treats a known colourless identity as colourless, and an unknown one as no restriction', () => {
    const kozilek = card('Kozilek', 'main', { isCommander: true, colors: [], colorIdentity: [] });
    expect(dockColorIdentity([kozilek, bolt], true)).toEqual([]);
    const unknown = card('Mystery', 'main', { isCommander: true, colors: ['B'] });
    expect(dockColorIdentity([unknown, bolt], true)).toBeUndefined();
    const tasigur = card('Tasigur', 'main', { isCommander: true, colors: ['B'], colorIdentity: ['B', 'G', 'U'] });
    expect(dockColorIdentity([tasigur, unknown], true)).toBeUndefined();
  });
});
