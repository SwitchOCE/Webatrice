import { render, screen } from '@testing-library/react';

import { emptyPriceLookup } from '../../pricing';
import type { DeckCard } from '../../types';
import { DeckCardPreview } from './DeckCardPreview';

const bolt: DeckCard = {
  name: 'Lightning Bolt',
  quantity: 1,
  category: 'main',
  lookupSource: 'scryfall',
  imageUri: 'https://cards.scryfall.io/small/front/b.jpg',
};

describe('DeckCardPreview', () => {
  it('invites a hover before any card is previewed', () => {
    render(<DeckCardPreview card={null} prices={emptyPriceLookup()} />);
    expect(screen.getByText('Hover a card to preview')).toBeInTheDocument();
  });

  it('shows the card at preview size with a buy link when Scryfall has one', () => {
    const prices = emptyPriceLookup();
    prices.byName.set('lightning bolt', { usd: 2, tcgplayer: 'https://tcg/bolt' });
    render(<DeckCardPreview card={bolt} prices={prices} />);

    expect(screen.getByRole('img', { name: 'Lightning Bolt' }))
      .toHaveAttribute('src', 'https://cards.scryfall.io/normal/front/b.jpg');
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://tcg/bolt');
    expect(screen.getByRole('link')).toHaveTextContent('$2.00');
  });

  it('handles a card without art or price', () => {
    render(<DeckCardPreview card={{ ...bolt, imageUri: undefined }} prices={emptyPriceLookup()} />);
    expect(screen.getByText('No image available')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
