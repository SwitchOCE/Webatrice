import { fireEvent, render, screen } from '@testing-library/react';

import { emptyPriceLookup } from '../../pricing';
import type { DeckCard } from '../../types';
import { DeckBuyButton } from './DeckBuyButton';

function card(name: string, quantity = 1): DeckCard {
  return { name, quantity, category: 'main', lookupSource: 'scryfall' };
}

function prices() {
  const lookup = emptyPriceLookup();
  lookup.byName.set('lightning bolt', { usd: 2, tcgplayer: null });
  return lookup;
}

describe('DeckBuyButton', () => {
  it('is disabled for an empty deck', () => {
    render(<DeckBuyButton cards={[]} prices={emptyPriceLookup()} loading={false} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByTitle('Add cards to enable')).toHaveTextContent('$0.00');
  });

  it('links the whole deck to TCGplayer mass entry with its total', () => {
    render(<DeckBuyButton cards={[card('Lightning Bolt', 4)]} prices={prices()} loading={false} />);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('$8.00');
    expect(link).toHaveAttribute('href', expect.stringContaining('massentry?c=4%20Lightning%20Bolt'));
  });

  it('shows pricing progress while loading', () => {
    render(<DeckBuyButton cards={[card('Lightning Bolt'), card('Mystery')]} prices={prices()} loading />);
    expect(screen.getByText('Pricing 1 card… (1/2)')).toBeInTheDocument();
  });

  it('lists the cards that have no price once loaded', () => {
    render(<DeckBuyButton cards={[card('Lightning Bolt'), card('Mystery', 2)]} prices={prices()} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Price missing for 2 cards — show/ }));
    expect(screen.getByText('Mystery')).toBeInTheDocument();
    expect(screen.getByText('2×')).toBeInTheDocument();
  });
});
