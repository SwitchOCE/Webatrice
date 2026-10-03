import { parseCod } from '@app/services';

import { deckSaveSignature, serializeDeckForSave } from './deckPersistence';
import type { HydratedDeck } from './types';

const deck: HydratedDeck = {
  name: 'Burn',
  meta: { v: 1, updatedAt: '2020-01-01T00:00:00.000Z' },
  cards: [{ name: 'Lightning Bolt', quantity: 4, category: 'main', lookupSource: 'scryfall', set: 'm11' }],
  format: 'modern',
  bannerCard: 'Lightning Bolt',
  bannerCardProviderId: 'abc-123',
  bracketAssessment: {
    level: 2, fingerprint: 'abcdefgh', gameChangers: [], turns: [], turnsRestricted: [],
    denial: [], denialRestricted: [], earlyCombos: [], lateCombos: [],
  },
};

describe('serializeDeckForSave', () => {
  it('writes the whole deck, including the banner and bracket cache, with a fresh updatedAt', () => {
    const parsed = parseCod(serializeDeckForSave(deck));
    expect(parsed.name).toBe('Burn');
    expect(parsed.format).toBe('modern');
    expect(parsed.bannerCard).toBe('Lightning Bolt');
    expect(parsed.bannerCardProviderId).toBe('abc-123');
    expect(parsed.bracketAssessment?.level).toBe(2);
    expect(parsed.meta.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('deckSaveSignature', () => {
  it('ignores the updatedAt stamp', () => {
    const touched = { ...deck, meta: { ...deck.meta, updatedAt: '2030-01-01T00:00:00.000Z' } };
    expect(deckSaveSignature(touched)).toBe(deckSaveSignature(deck));
  });

  it('ignores lookup-only card fields', () => {
    const rehydrated = { ...deck, cards: [{ ...deck.cards[0], typeLine: 'Instant', imageUri: 'x' }] };
    expect(deckSaveSignature(rehydrated)).toBe(deckSaveSignature(deck));
  });

  it.each<[string, Partial<HydratedDeck>]>([
    ['name', { name: 'Burn v2' }],
    ['format', { format: 'legacy' }],
    ['description', { meta: { ...deck.meta, description: 'notes' } }],
    ['banner', { bannerCard: 'Shock' }],
    ['banner printing', { bannerCardProviderId: 'other' }],
    ['tags', { tagsXml: '<tags><tag>Aggro</tag></tags>' }],
    ['bracket cache', { bracketAssessment: undefined }],
    ['quantity', { cards: [{ ...deck.cards[0], quantity: 3 }] }],
    ['zone', { cards: [{ ...deck.cards[0], category: 'sideboard' }] }],
    ['commander flag', { cards: [{ ...deck.cards[0], isCommander: true }] }],
    ['printing', { cards: [{ ...deck.cards[0], set: 'lea' }] }],
  ])('changes when the %s changes', (_field, patch) => {
    expect(deckSaveSignature({ ...deck, ...patch })).not.toBe(deckSaveSignature(deck));
  });
});
