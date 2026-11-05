import { act, render, waitFor } from '@testing-library/react';

import { CardPreviewProvider, createCardPreviewStore } from '../CardPreviewContext';
import { BigCardPreview } from './BigCardPreview';

vi.mock('../../../services/cardImages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/cardImages')>()),
  lookupGameCard: async (name: string) => ({ card: {
    found: true, source: 'scryfall', name, typeLine: name.endsWith('Token') ? 'Token Creature' : 'Creature',
    printings: [{ scryfallId: 'resolved-id' }],
  } }),
}));

const ID = '0f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function renderOpenOn(card: { name: string; scryfallId?: string }) {
  const store = createCardPreviewStore();
  render(
    <CardPreviewProvider store={store}>
      <BigCardPreview />
    </CardPreviewProvider>,
  );
  act(() => store.openBigPreview(card));
  return document.body.querySelector('img')?.getAttribute('src');
}

describe('BigCardPreview image', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'resolved-id', name: 'Rhino, Warrior' }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zooms the chosen printing by Scryfall id', () => {
    expect(renderOpenOn({ name: 'Rhino, Warrior Token', scryfallId: ID }))
      .toBe(`https://cards.scryfall.io/large/front/0/f/${ID}.jpg`);
  });

  it('waits for a name-only card, then zooms the shared CDN image', async () => {
    expect(renderOpenOn({ name: 'Rhino, Warrior Token' })).not.toContain('api.scryfall.com');
    await waitFor(() => expect(document.body.querySelector('img'))
      .toHaveAttribute('src', 'https://cards.scryfall.io/large/front/r/e/resolved-id.jpg'));
  });
});
