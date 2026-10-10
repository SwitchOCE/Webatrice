import { lookupCards } from '@app/services';
import type { ParsedDeck } from '@app/types';

import { hydrateDeck } from './hydrate';

vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  lookupCards: vi.fn(),
}));

it('passes the caller signal to catalogue hydration', async () => {
  vi.mocked(lookupCards).mockResolvedValue(new Map());
  const signal = new AbortController().signal;
  const parsed = {
    name: 'Deck',
    format: 'modern',
    meta: { v: 1, updatedAt: '' },
    cards: [{ name: 'Lightning Bolt', quantity: 4, category: 'main' }],
  } as ParsedDeck;

  await hydrateDeck(parsed, signal);

  expect(lookupCards).toHaveBeenCalledWith(['Lightning Bolt'], signal);
});
