import { render, screen } from '@testing-library/react';

import type { DeckCard } from '../../types';
import { DeckBreakdown } from './DeckBreakdown';

vi.mock('./BracketSection', () => ({ BracketSection: () => <div>bracket section</div> }));

const cards: DeckCard[] = [
  { name: 'Forest', quantity: 10, category: 'main', lookupSource: 'scryfall', typeLine: 'Basic Land — Forest' },
  { name: 'Elves', quantity: 4, category: 'main', lookupSource: 'scryfall', typeLine: 'Creature', cmc: 1, colors: ['G'] },
  { name: 'Ugin', quantity: 1, category: 'main', lookupSource: 'scryfall', typeLine: 'Planeswalker', cmc: 8, colors: [] },
];

describe('DeckBreakdown', () => {
  it('renders nothing for an empty deck', () => {
    const { container } = render(<DeckBreakdown cards={[]} format="commander" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows totals, curve, colours and types', () => {
    render(<DeckBreakdown cards={cards} format="modern" />);

    expect(screen.getByText('15').nextSibling).toHaveTextContent('DeckBreakdown.stat.total');
    expect(screen.getByText('DeckBreakdown.stat.nonland').previousSibling).toHaveTextContent('5');
    expect(screen.getByText('2.40')).toBeInTheDocument();
    // Buckets 0–7+: four 1-drops are the tallest bar, Ugin (8) lands in 7+.
    const bars = screen.getAllByTitle('DeckBreakdown.curve.barTitle');
    expect(bars).toHaveLength(8);
    expect(bars[1]).toHaveStyle({ height: '100%' });
    expect(bars[7]).toHaveStyle({ height: '25%' });
    expect(screen.getByText('DeckBreakdown.curve.sevenPlus')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'DeckBreakdown.pieLabel' })).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('CardSearch.cardType.Planeswalker')).toBeInTheDocument();
  });

  it('adds the bracket estimate for commander-family formats only', () => {
    const { rerender } = render(<DeckBreakdown cards={cards} format="modern" />);
    expect(screen.queryByText('bracket section')).toBeNull();
    rerender(<DeckBreakdown cards={cards} format="paupercommander" />);
    expect(screen.getByText('DeckBreakdown.bracketEstimate')).toBeInTheDocument();
    expect(screen.getByText('bracket section')).toBeInTheDocument();
  });
});
