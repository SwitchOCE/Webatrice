import {
  buildTcgMassEntryUrl,
  computeDeckPrice,
  emptyPriceLookup,
  priceForCard,
  pricingProgress,
  unpricedCards,
  type PriceLookup,
} from './pricing';
import type { DeckCard } from './types';

function card(name: string, overrides: Partial<DeckCard> = {}): DeckCard {
  return { name, quantity: 1, category: 'main', lookupSource: 'scryfall', ...overrides };
}

function lookup(): PriceLookup {
  const prices = emptyPriceLookup();
  prices.byId.set('id-bolt-lea', { usd: null, tcgplayer: null });
  prices.byId.set('id-sol', { usd: 1.5, tcgplayer: 'https://tcg/sol' });
  prices.byName.set('lightning bolt', { usd: 2, tcgplayer: 'https://tcg/bolt' });
  return prices;
}

describe('priceForCard', () => {
  it('prefers a priced printing, falls back to the name, then to the priceless printing', () => {
    const prices = lookup();
    expect(priceForCard(prices, { name: 'Sol Ring', scryfallId: 'id-sol' })?.usd).toBe(1.5);
    expect(priceForCard(prices, { name: 'Lightning Bolt', scryfallId: 'id-bolt-lea' })?.usd).toBe(2);
    prices.byName.clear();
    expect(priceForCard(prices, { name: 'Lightning Bolt', scryfallId: 'id-bolt-lea' })).toEqual({ usd: null, tcgplayer: null });
    expect(priceForCard(prices, { name: 'Unknown' })).toBeUndefined();
  });
});

describe('deck totals', () => {
  const cards = [
    card('Sol Ring', { scryfallId: 'id-sol', quantity: 2 }),
    card('Lightning Bolt', { quantity: 4 }),
    card('Zzz Token', { quantity: 3 }),
    card('Zzz Token', { category: 'sideboard' }),
  ];

  it('sums priced cards by quantity and counts the unpriced ones', () => {
    expect(computeDeckPrice(cards, lookup())).toEqual({ total: 11, missing: 4 });
  });

  it('reports unique-name pricing progress', () => {
    expect(pricingProgress(cards, lookup())).toEqual({ pricedUnique: 2, totalUnique: 3 });
  });

  it('groups unpriced cards by name with summed quantities', () => {
    expect(unpricedCards([...cards, card('Aaa')], lookup())).toEqual([
      { name: 'Aaa', qty: 1 },
      { name: 'Zzz Token', qty: 4 },
    ]);
  });
});

describe('buildTcgMassEntryUrl', () => {
  it('keeps TCGplayer’s literal separators and apostrophes', () => {
    expect(buildTcgMassEntryUrl([
      card('Urza\'s Saga', { quantity: 1, set: 'mh2', collectorNumber: '259' }),
      card('Forest', { quantity: 0 }),
      card('Island', { quantity: 2 }),
    ])).toBe('https://www.tcgplayer.com/massentry?c=1%20Urza\'s%20Saga%20%5BMH2%5D%20259||2%20Island&productline=Magic');
  });
});
