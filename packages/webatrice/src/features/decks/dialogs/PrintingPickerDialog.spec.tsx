import { fireEvent, render, screen } from '@testing-library/react';

import { useCardPrintings } from '../hooks/useCardPrintings';
import { emptyPriceLookup } from '../pricing';
import type { DeckCard } from '../types';
import { PrintingPickerDialog } from './PrintingPickerDialog';

vi.mock('../hooks/useCardPrintings', () => ({ useCardPrintings: vi.fn() }));

const bolt: DeckCard = {
  name: 'Lightning Bolt', quantity: 4, category: 'main', lookupSource: 'scryfall', scryfallId: 'm11-id',
};
const m11 = { set: 'm11', collectorNumber: '149', scryfallId: 'm11-id', imageUri: 'https://cards.scryfall.io/small/front/m11.jpg' };
const a25 = { set: 'a25', collectorNumber: '141', scryfallId: 'a25-id' };

function printings(overrides: Partial<ReturnType<typeof useCardPrintings>>) {
  vi.mocked(useCardPrintings).mockReturnValue({
    printings: [], loading: false, error: null, prices: emptyPriceLookup(), ...overrides,
  });
}

describe('PrintingPickerDialog', () => {
  it('renders nothing without a request', () => {
    printings({});
    render(<PrintingPickerDialog request={null} onClose={vi.fn()} onPick={vi.fn()} />);
    expect(useCardPrintings).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByText('Choose printing')).toBeNull();
  });

  it('lists printings with prices, marks the current one and picks', () => {
    const prices = emptyPriceLookup();
    prices.byId.set('a25-id', { usd: 1.5, tcgplayer: null });
    printings({ printings: [m11, a25], prices });
    const onPick = vi.fn();
    render(<PrintingPickerDialog request={{ index: 0, card: bolt }} onClose={vi.fn()} onPick={onPick} />);

    expect(useCardPrintings).toHaveBeenLastCalledWith('Lightning Bolt');
    expect(screen.getByText('· 2 printings')).toBeInTheDocument();
    const current = screen.getByTitle('M11 · Lightning Bolt');
    expect(current).toHaveTextContent('Current');
    expect(screen.getByAltText('Lightning Bolt (m11)')).toHaveAttribute('src', 'https://cards.scryfall.io/normal/front/m11.jpg');
    expect(screen.getByText('$1.50')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('A25 · Lightning Bolt'));
    expect(onPick).toHaveBeenCalledWith(a25);
  });

  it('shows loading, errors and an empty result', () => {
    printings({ loading: true });
    const { rerender } = render(
      <PrintingPickerDialog request={{ index: 0, card: bolt }} onClose={vi.fn()} onPick={vi.fn()} />,
    );
    expect(screen.getByText('Loading printings…')).toBeInTheDocument();

    printings({ error: 'Scryfall is down' });
    rerender(<PrintingPickerDialog request={{ index: 0, card: bolt }} onClose={vi.fn()} onPick={vi.fn()} />);
    expect(screen.getByText('Scryfall is down')).toBeInTheDocument();

    printings({});
    rerender(<PrintingPickerDialog request={{ index: 0, card: bolt }} onClose={vi.fn()} onPick={vi.fn()} />);
    expect(screen.getByText('No printings found.')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    printings({});
    const onClose = vi.fn();
    render(<PrintingPickerDialog request={{ index: 0, card: bolt }} onClose={onClose} onPick={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
