import { fireEvent, render, screen, within } from '@testing-library/react';

import type { DeckCard } from '../../types';
import { DeckCardRow, type DeckCardRowProps } from './DeckCardRow';

const bolt: DeckCard = { name: 'Lightning Bolt', quantity: 4, category: 'main', lookupSource: 'scryfall', manaCost: '{R}' };

function renderRow(overrides: Partial<DeckCardRowProps> = {}) {
  const props: DeckCardRowProps = {
    card: bolt,
    onInc: vi.fn(),
    onDelete: vi.fn(),
    onSetCategory: vi.fn(),
    onSetCommander: vi.fn(),
    onChangePrinting: vi.fn(),
    onHover: vi.fn(),
    onCardClick: vi.fn(),
    isMtg: true,
    isCommander: false,
    ...overrides,
  };
  render(<DeckCardRow {...props} />);
  return props;
}

describe('DeckCardRow', () => {
  it('shows quantity, name and cost, and previews on hover or focus', () => {
    const props = renderRow();
    const row = screen.getByText('4').parentElement!;
    expect(within(row).getByRole('img', { name: '{R}' })).toBeInTheDocument();

    fireEvent.mouseEnter(row);
    fireEvent.focus(screen.getByRole('button', { name: 'Lightning Bolt' }));
    expect(props.onHover).toHaveBeenCalledTimes(2);
  });

  it('opens the detail view from the name', () => {
    const props = renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Lightning Bolt' }));
    expect(props.onCardClick).toHaveBeenCalled();
  });

  it('routes the row menu to the row callbacks', () => {
    const props = renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Card actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to sideboard' }));
    expect(props.onInc).toHaveBeenCalledWith(-1);
    expect(props.onSetCategory).toHaveBeenCalledWith('sideboard');
  });
});
