import { renderHook, waitFor } from '@testing-library/react';

import { fetchAllPrintings, lookupCard } from '@app/services';

import { emptyPriceLookup, fetchPricesForCards } from '../pricing';
import { useCardPrintings } from './useCardPrintings';

vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  fetchAllPrintings: vi.fn(),
  lookupCard: vi.fn(),
}));
vi.mock('../pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pricing')>()),
  fetchPricesForCards: vi.fn(),
}));

describe('useCardPrintings', () => {
  it('loads nothing without a card', () => {
    const { result } = renderHook(() => useCardPrintings(undefined));
    expect(result.current.loading).toBe(false);
    expect(fetchAllPrintings).not.toHaveBeenCalled();
  });

  it('lists every Scryfall printing, then prices the ones with an id', async () => {
    vi.mocked(fetchAllPrintings).mockResolvedValue([
      { set: 'lea', collectorNumber: '161', scryfallId: 'id-lea' },
      { set: 'm11', collectorNumber: '149' },
    ]);
    const prices = emptyPriceLookup();
    prices.byId.set('id-lea', { usd: 400, tcgplayer: null });
    vi.mocked(fetchPricesForCards).mockResolvedValue(prices);

    const { result } = renderHook(() => useCardPrintings('Lightning Bolt'));

    await waitFor(() => expect(result.current.prices.byId.get('id-lea')?.usd).toBe(400));
    expect(result.current.printings.map((p) => p.set)).toEqual(['lea', 'm11']);
    expect(result.current.loading).toBe(false);
    expect(fetchPricesForCards).toHaveBeenCalledWith([{ scryfallId: 'id-lea', name: 'Lightning Bolt' }]);
  });

  it('falls back to the catalog printings when Scryfall has none', async () => {
    vi.mocked(fetchAllPrintings).mockResolvedValue([]);
    vi.mocked(lookupCard).mockResolvedValue({
      found: true, source: 'dexie', name: 'Custom', printings: [{ set: 'cus', collectorNumber: '1' }],
    });

    const { result } = renderHook(() => useCardPrintings('Custom'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.printings).toEqual([{ set: 'cus', collectorNumber: '1' }]);
    expect(fetchPricesForCards).not.toHaveBeenCalled();
  });

  it('reports a failure', async () => {
    vi.mocked(fetchAllPrintings).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCardPrintings('X'));
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.loading).toBe(false);
  });
});
