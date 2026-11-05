import { act, render, waitFor } from '@testing-library/react';

import type { CardPreviewMessage } from './cardPreviewChannel';
import CardPreviewPopupPage from './CardPreviewPopupPage';

const channel = vi.hoisted(() => ({ handler: null as ((msg: CardPreviewMessage) => void) | null }));

vi.mock('./cardPreviewChannel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cardPreviewChannel')>()),
  postCardPreviewMessage: vi.fn(),
  subscribeToCardPreviewChannel: (handler: (msg: CardPreviewMessage) => void) => {
    channel.handler = handler;
    return () => {};
  },
}));

vi.mock('../../services/cardImages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/cardImages')>()),
  lookupGameCard: async (name: string) => ({ card: {
    found: true, source: 'scryfall', name, typeLine: name.endsWith('Token') ? 'Token Creature' : 'Creature',
    printings: [{ scryfallId: 'resolved-id' }],
  } }),
}));

const ID = '0f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function showCard(card: { name: string; scryfallId?: string }) {
  const { container } = render(<CardPreviewPopupPage />);
  act(() => channel.handler?.({ kind: 'card', card }));
  return container;
}

describe('CardPreviewPopupPage image', () => {
  it('shows the chosen printing by Scryfall id', () => {
    expect(showCard({ name: 'Rhino, Warrior Token', scryfallId: ID }).querySelector('img')?.getAttribute('src'))
      .toBe(`https://cards.scryfall.io/large/front/0/f/${ID}.jpg`);
  });

  it('waits for a name-only card to resolve, then uses the shared CDN URL', async () => {
    const container = showCard({ name: 'Rhino, Warrior Token' });
    expect(container.querySelector('img')?.getAttribute('src')).not.toContain('api.scryfall.com');
    await waitFor(() => expect(container.querySelector('img'))
      .toHaveAttribute('src', 'https://cards.scryfall.io/large/front/r/e/resolved-id.jpg'));
  });
});
