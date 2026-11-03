import { render, screen } from '@testing-library/react';

import type { DeckCard } from '../../types';
import { DeckBreakdown } from './DeckBreakdown';

const cards: DeckCard[] = [
  { name: 'Forest', quantity: 10, category: 'main', lookupSource: 'scryfall', typeLine: 'Basic Land — Forest' },
  { name: 'Elves', quantity: 4, category: 'main', lookupSource: 'scryfall', typeLine: 'Creature', cmc: 1, colors: ['G'] },
  { name: 'Ugin', quantity: 1, category: 'main', lookupSource: 'scryfall', typeLine: 'Planeswalker', cmc: 8, colors: [] },
];

describe('DeckBreakdown', () => {
  it('says so for an empty deck', () => {
    render(<DeckBreakdown cards={[]} />);
    expect(screen.getByText('DeckBreakdown.noCards')).toBeInTheDocument();
    expect(screen.queryByText('DeckBreakdown.stat.total')).toBeNull();
  });

  it('shows totals, curve, colours and types', () => {
    render(<DeckBreakdown cards={cards} />);

    expect(screen.getByText('15').nextSibling).toHaveTextContent('DeckBreakdown.stat.total');
    expect(screen.getByText('DeckBreakdown.stat.nonland').previousSibling).toHaveTextContent('5');
    expect(screen.getByText('2.40')).toBeInTheDocument();
    const bars = screen.getAllByTitle('DeckBreakdown.curve.barTitle');
    expect(bars).toHaveLength(8);
    expect(bars[1]).toHaveStyle({ height: '100%' });
    expect(bars[7]).toHaveStyle({ height: '25%' });
    expect(bars[0]).toHaveStyle({ height: '2px' });
    expect(screen.getByText('DeckBreakdown.curve.sevenPlus')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'DeckBreakdown.colorBar' })).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('CardSearch.cardType.Planeswalker')).toBeInTheDocument();
  });
});
