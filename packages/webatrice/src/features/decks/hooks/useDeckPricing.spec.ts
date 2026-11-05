import { act, renderHook, waitFor } from '@testing-library/react';

import { emptyPriceLookup, fetchPricesForCards, type PriceLookup } from '../pricing';
import type { HydratedDeck } from '../types';
import { deckPriceKey, useDeckPricing } from './useDeckPricing';

vi.mock('../pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pricing')>()),
  fetchPricesForCards: vi.fn(),
}));

function deck(cards: HydratedDeck['cards']): HydratedDeck {
  return { name: 'D', meta: { v: 1, updatedAt: 'x' }, format: 'modern', cards };
}

const bolt = { name: 'Lightning Bolt', quantity: 4, category: 'main' as const, lookupSource: 'scryfall' as const };
const sol = { ...bolt, name: 'Sol Ring', quantity: 1, scryfallId: 'id-sol' };

function priced(): PriceLookup {
  const lookup = emptyPriceLookup();
  lookup.byName.set('lightning bolt', { usd: 2, tcgplayer: null });
  return lookup;
}

describe('deckPriceKey', () => {
  it('fingerprints printings and bare names, ignoring quantity and order', () => {
    expect(deckPriceKey(deck([bolt, sol]))).toBe('id:id-sol|name:lightning bolt');
    expect(deckPriceKey(deck([{ ...sol, quantity: 9 }, { ...bolt, quantity: 1 }]))).toBe('id:id-sol|name:lightning bolt');
    expect(deckPriceKey(null)).toBe('');
  });
});

describe('useDeckPricing', () => {
  it('streams partial prices, then persists the settled total and missing count', async () => {
    vi.mocked(fetchPricesForCards).mockImplementation(async (_cards, onProgress) => {
      onProgress?.(priced());
      return priced();
    });
    const persist = vi.fn();
    const d = deck([bolt, sol]);

    const { result } = renderHook(() => useDeckPricing(d, persist));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.prices.byName.get('lightning bolt')?.usd).toBe(2);
    expect(persist).toHaveBeenLastCalledWith(8, 1);
  });

  it('does not refetch for a quantity-only change', async () => {
    vi.mocked(fetchPricesForCards).mockImplementation(async (_cards, onProgress) => {
      onProgress?.(priced());
      return priced();
    });
    const persist = vi.fn();
    const { rerender } = renderHook(({ d }) => useDeckPricing(d, persist), {
      initialProps: { d: deck([bolt]) },
    });
    await waitFor(() => expect(persist).toHaveBeenCalled());

    rerender({ d: deck([{ ...bolt, quantity: 1 }]) });
    await waitFor(() => expect(persist).toHaveBeenLastCalledWith(2, undefined));
    expect(fetchPricesForCards).toHaveBeenCalledTimes(1);
  });

  it('preserves the stored total when the fetch fails', async () => {
    vi.mocked(fetchPricesForCards).mockRejectedValue(new Error('offline'));
    const persist = vi.fn();
    const { result } = renderHook(() => useDeckPricing(deck([bolt]), persist));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not persist the initial empty render or progress before completion', async () => {
    let resolve!: (prices: PriceLookup) => void;
    vi.mocked(fetchPricesForCards).mockImplementation((_cards, onProgress) => {
      onProgress?.(priced());
      return new Promise((done) => {
        resolve = done;
      });
    });
    const persist = vi.fn();
    const { result } = renderHook(() => useDeckPricing(deck([bolt]), persist));
    expect(result.current.prices.byName.size).toBe(1);
    expect(persist).not.toHaveBeenCalled();
    await act(async () => resolve(priced()));
    expect(persist).toHaveBeenCalledExactlyOnceWith(8, undefined);
  });

  it('does not persist partial progress when a later chunk fails', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(fetchPricesForCards).mockImplementation((_cards, onProgress) => {
      onProgress?.(priced());
      return new Promise((_resolve, fail) => {
        reject = fail;
      });
    });
    const persist = vi.fn();
    const { result } = renderHook(() => useDeckPricing(deck([bolt, sol]), persist));
    await act(async () => reject(new Error('offline')));
    expect(result.current.loading).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('clears the stored price when a successful fetch has no usable prices', async () => {
    vi.mocked(fetchPricesForCards).mockResolvedValue(emptyPriceLookup());
    const persist = vi.fn();
    const { result } = renderHook(() => useDeckPricing(deck([bolt]), persist));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(persist).toHaveBeenCalledExactlyOnceWith(undefined, 4);
  });

  it.each([
    ['adding a card', [bolt, sol]],
    ['changing a printing', [{ ...bolt, scryfallId: 'id-bolt' }]],
  ] as const)('keeps previous prices visible while %s loads a new key', async (_change, cards) => {
    const previous = priced();
    vi.mocked(fetchPricesForCards).mockResolvedValueOnce(previous).mockImplementation(() => new Promise(() => {}));
    const persist = vi.fn();
    const { result, rerender } = renderHook(({ d }) => useDeckPricing(d, persist), {
      initialProps: { d: deck([bolt]) },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    persist.mockClear();

    rerender({ d: deck([...cards]) });

    expect(result.current.prices).toBe(previous);
    expect(result.current.loading).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([true, false])('clears the stored price for an empty deck (initially empty: %s)', async (initiallyEmpty) => {
    vi.mocked(fetchPricesForCards).mockResolvedValue(priced());
    const persist = vi.fn();
    const { result, rerender } = renderHook(({ d }) => useDeckPricing(d, persist), {
      initialProps: { d: deck(initiallyEmpty ? [] : [bolt]) },
    });
    if (!initiallyEmpty) {
      await waitFor(() => expect(result.current.loading).toBe(false));
      persist.mockClear();
      rerender({ d: deck([]) });
    }

    expect(result.current.loading).toBe(false);
    expect(persist).toHaveBeenCalledExactlyOnceWith(undefined, undefined);
    expect(fetchPricesForCards).toHaveBeenCalledTimes(initiallyEmpty ? 0 : 1);
  });

  it('does not persist previous prices for a new key or accept late results for an old key', async () => {
    const pending: Array<(prices: PriceLookup) => void> = [];
    vi.mocked(fetchPricesForCards).mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const persist = vi.fn();
    const { result, rerender } = renderHook(({ d }) => useDeckPricing(d, persist), {
      initialProps: { d: deck([bolt]) },
    });
    await act(async () => pending[0](priced()));
    expect(persist).toHaveBeenCalledExactlyOnceWith(8, undefined);
    persist.mockClear();

    rerender({ d: deck([bolt, sol]) });
    expect(persist).not.toHaveBeenCalled();
    rerender({ d: deck([sol]) });
    await act(async () => pending[1](priced()));
    expect(persist).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    await act(async () => pending[2](emptyPriceLookup()));
    expect(result.current.loading).toBe(false);
    expect(persist).toHaveBeenCalledExactlyOnceWith(undefined, 1);
  });
});
