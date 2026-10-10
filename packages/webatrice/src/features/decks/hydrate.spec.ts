import type { LookupResult } from '@app/services';

import { assembleDeckCard } from './hydrate';

const ID = '0f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

const lookup = (overrides: Partial<LookupResult> = {}): LookupResult => ({
  found: true,
  source: 'dexie',
  name: 'Sol Ring',
  printings: [{ set: 'C21', collectorNumber: '263', scryfallId: 'other-id', imageUri: 'https://mirror/c21.jpg' }],
  ...overrides,
});

describe('assembleDeckCard image', () => {
  it('uses the chosen printing\'s image when the catalog knows it', () => {
    const card = assembleDeckCard({ name: 'Sol Ring', quantity: 1, category: 'main', scryfallId: 'other-id' }, lookup());
    expect(card.imageUri).toBe('https://mirror/c21.jpg');
  });

  it('loads a printing the catalog does not know by its Scryfall id', () => {
    const card = assembleDeckCard({ name: 'Sol Ring', quantity: 1, category: 'main', scryfallId: ID }, lookup());
    expect(card.imageUri).toBe(`https://api.scryfall.com/cards/${ID}?format=image&version=normal`);
  });

  it('retains the id fallback when a matching printing has no image metadata', () => {
    const card = assembleDeckCard(
      { name: 'Sol Ring', quantity: 1, category: 'main', scryfallId: ID },
      lookup({ printings: [{ scryfallId: ID }] }),
    );
    expect(card.imageUris).toEqual([`https://api.scryfall.com/cards/${ID}?format=image&version=normal`]);
  });

  it('uses the first preferred printing when the deck has no override', () => {
    const card = assembleDeckCard(
      { name: 'Sol Ring', quantity: 1, category: 'main' },
      lookup({
        printings: [
          { set: 'MPS', scryfallId: 'preferred', imageUri: 'https://img/preferred.jpg' },
          { set: 'C21', scryfallId: 'last', imageUri: 'https://img/last.jpg' },
        ],
      }),
    );

    expect(card).toMatchObject({ set: 'MPS', scryfallId: 'preferred', imageUri: 'https://img/preferred.jpg' });
  });

  it('keeps the selected printing image fallback chain', () => {
    const card = assembleDeckCard(
      { name: 'Sol Ring', quantity: 1, category: 'main' },
      lookup({
        printings: [{
          set: 'C21',
          imageUri: 'https://img/first.jpg',
          imageUris: ['https://img/first.jpg', 'https://img/second.jpg'],
        }],
      }),
    );

    expect(card.imageUris).toEqual(['https://img/first.jpg', 'https://img/second.jpg']);
  });
});
