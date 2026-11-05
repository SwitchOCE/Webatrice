import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { fetchAllPrintings, fetchScryfallDetail, type ScryfallDetail } from '@app/services';

import { emptyPriceLookup } from '../../pricing';
import type { DeckCard } from '../../types';
import { DeckInspector } from './DeckInspector';

vi.mock('@app/services', async (original) => ({
  ...await original<typeof import('@app/services')>(), fetchAllPrintings: vi.fn(), fetchScryfallDetail: vi.fn(),
}));

const card: DeckCard = { name: 'Bear', category: 'main', quantity: 1, lookupSource: 'scryfall' };

function inspector(previewOnly = false, fallback: DeckCard = card) {
  return <DeckInspector
    selected={{ name: fallback.name, category: 'main' }} index={0} deckCards={[fallback]}
    prices={emptyPriceLookup()} isCommanderDeck={false} previewOnly={previewOnly}
    onInc={vi.fn()} onDelete={vi.fn()} onSetCommander={vi.fn()} onSetPrinting={vi.fn()}
    onAdd={vi.fn()}
  />;
}

beforeEach(() => {
  vi.mocked(fetchScryfallDetail).mockResolvedValue(null);
  vi.mocked(fetchAllPrintings).mockReturnValue(new Promise(() => {}));
});

it('fetches printings only after the disclosure opens and stops fetching while collapsed', async () => {
  const { rerender } = render(inspector());
  expect(fetchAllPrintings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /DeckInspector.changePrinting/ }));
  await waitFor(() => expect(fetchAllPrintings).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: /DeckInspector.changePrinting/ }));
  rerender(inspector(false, { ...card, name: 'Another bear' }));
  expect(fetchAllPrintings).toHaveBeenCalledTimes(1);
});

it('does not fetch card details for a hover-only preview, but loads them when selected', async () => {
  const { rerender } = render(inspector(true));
  expect(fetchScryfallDetail).not.toHaveBeenCalled();
  rerender(inspector());
  await waitFor(() => expect(fetchScryfallDetail).toHaveBeenCalledTimes(1));
});

it.each([
  [{ id: 'bear', name: 'Bear', power: '2', toughness: '3' }, '2/3'],
  [{ id: 'bear', name: 'Bear // Beast', power: '9', toughness: '9', card_faces: [{ name: 'Bear', power: '4', toughness: '5' }] }, '4/5'],
  [null, '1/1'],
])('shows creature stats from the fetched face or detail with deck-card fallback (%s)', async (detail, stats) => {
  vi.mocked(fetchScryfallDetail).mockResolvedValue(detail as ScryfallDetail | null);
  render(inspector(false, { ...card, power: '1', toughness: '1' }));
  expect(await screen.findByText(stats)).toBeInTheDocument();
});
