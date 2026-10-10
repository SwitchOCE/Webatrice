import { act, render, screen } from '@testing-library/react';

import { CardPreviewProvider, createCardPreviewStore } from '../ui/CardPreviewContext';
import CardPreviewPane from './CardPreviewPane';

vi.mock('../CardPreviewPopup/useCardPreviewPopup', () => ({
  useCardPreviewPopup: () => ({ isOpen: false, toggle: vi.fn() }),
}));

const ID = '0f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function hover(card: { name: string; scryfallId?: string }) {
  const store = createCardPreviewStore();
  const { container } = render(
    <CardPreviewProvider store={store}>
      <CardPreviewPane />
    </CardPreviewProvider>,
  );
  act(() => store.setHoveredCard(card));
  return container.querySelector('img[src*="scryfall"]')?.getAttribute('src');
}

describe('CardPreviewPane', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('previews the hovered printing by Scryfall id', () => {
    expect(hover({ name: 'Rhino, Warrior Token', scryfallId: ID }))
      .toBe(`https://api.scryfall.com/cards/${ID}?format=image&version=png`);
  });

  it('previews a name-only card by its exact name', () => {
    expect(hover({ name: 'Rhino, Warrior Token' }))
      .toBe('https://api.scryfall.com/cards/named?exact=Rhino%2C%20Warrior%20Token&format=image&version=png');
  });

  it('is a labelled region whose mode buttons are pressable toggles', () => {
    render(
      <CardPreviewProvider store={createCardPreviewStore()}>
        <CardPreviewPane />
      </CardPreviewProvider>,
    );
    expect(screen.getByRole('region', { name: 'CardPreviewPane.label' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CardPreviewPane.showImage' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('CardPreviewPane.hoverToPreview')).toBeInTheDocument();
  });
});
