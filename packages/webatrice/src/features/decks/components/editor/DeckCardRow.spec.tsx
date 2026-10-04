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
    fireEvent.click(screen.getByRole('button', { name: 'DeckEditor.rowActions.trigger' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeckEditor.rowActions.decrease' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'DeckEditor.rowActions.moveToSideboard' }));
    expect(props.onInc).toHaveBeenCalledWith(-1);
    expect(props.onSetCategory).toHaveBeenCalledWith('sideboard');
  });

  it('paints an illegal row red and names the reason', () => {
    renderRow({ legality: { status: 'illegal', reason: 'tooMany', max: 4 } });
    const row = screen.getByText('4').parentElement!;
    expect(row.className).toContain('bg-red-500/15');
    expect(row).toHaveAttribute('title', 'DeckLegality.reason.tooMany');
    expect(within(row).getByRole('img', { name: 'DeckLegality.reason.tooMany' })).toBeInTheDocument();
  });

  it('leaves legal and unchecked rows unmarked', () => {
    renderRow({ legality: { status: 'unknown' } });
    const row = screen.getByText('4').parentElement!;
    expect(row.className).not.toContain('bg-red');
    expect(within(row).queryByRole('img', { name: /DeckLegality/ })).toBeNull();
  });
});
