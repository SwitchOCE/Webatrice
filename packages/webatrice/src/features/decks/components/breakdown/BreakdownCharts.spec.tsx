import { render, screen } from '@testing-library/react';

import { SectionHeader, StatCard } from './BreakdownBlocks';
import { ColorPie } from './ColorPie';
import { ManaCurve } from './ManaCurve';
import { TypeBreakdown } from './TypeBreakdown';

describe('breakdown building blocks', () => {
  it('StatCard and SectionHeader render their content', () => {
    render(
      <>
        <SectionHeader>Overview</SectionHeader>
        <StatCard label="Lands" value={36} />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('36').nextSibling).toHaveTextContent('Lands');
  });

  it('ManaCurve scales every bucket against the tallest', () => {
    render(<ManaCurve curve={{ 1: 2, 3: 4 }} />);
    expect(screen.getByTitle('4 cards at CMC 3')).toHaveStyle({ height: '100%' });
    expect(screen.getByTitle('2 cards at CMC 1')).toHaveStyle({ height: '50%' });
    expect(screen.getByTitle('0 cards at CMC 0')).toHaveStyle({ height: '0%' });
  });

  it('ColorPie shows an empty disc without cards, else slices and a legend', () => {
    const { rerender, container } = render(<ColorPie pips={{ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }} />);
    expect(container.querySelector('svg')).toBeNull();

    rerender(<ColorPie pips={{ W: 1, U: 0, B: 0, R: 3, G: 0, C: 0 }} />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(screen.getByTitle('Red')).toHaveTextContent('375%');
    expect(screen.getByRole('img', { name: 'White' })).toHaveAttribute('src', 'https://svgs.scryfall.io/card-symbols/W.svg');
  });

  it('TypeBreakdown lists the most common types first', () => {
    const { rerender } = render(<TypeBreakdown counts={{ Land: 2, Creature: 5, Instant: 0 }} />);
    expect(screen.getAllByText(/Creature|Land|Instant/).map((el) => el.textContent)).toEqual(['Creature', 'Land']);
    rerender(<TypeBreakdown counts={{}} />);
    expect(screen.getByText('No cards yet.')).toBeInTheDocument();
  });
});
