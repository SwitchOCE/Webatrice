import { act, renderHook } from '@testing-library/react';

import { searchScryfallCards } from '../search';
import { SEARCH_DEBOUNCE_MS, useScryfallCardSearch } from './useScryfallCardSearch';

vi.mock('../search', () => ({ searchScryfallCards: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
  });
}

describe('useScryfallCardSearch', () => {
  it('stays empty for an empty query', async () => {
    const { result } = renderHook(() => useScryfallCardSearch('  '));
    await settle();
    expect(searchScryfallCards).not.toHaveBeenCalled();
    expect(result.current).toEqual({ results: [], loading: false, error: null });
  });

  it('searches the trimmed query after the debounce', async () => {
    vi.mocked(searchScryfallCards).mockResolvedValue([{ id: 'b', name: 'Lightning Bolt' }]);
    const { result } = renderHook(() => useScryfallCardSearch('bolt c:r '));
    expect(result.current.loading).toBe(true);

    await settle();

    expect(vi.mocked(searchScryfallCards).mock.calls[0][0]).toBe('bolt c:r');
    expect(result.current).toEqual({ results: [{ id: 'b', name: 'Lightning Bolt' }], loading: false, error: null });
  });

  it('aborts the previous request when the query changes', async () => {
    vi.mocked(searchScryfallCards).mockResolvedValue([]);
    const { rerender } = renderHook(({ q }) => useScryfallCardSearch(q), { initialProps: { q: 'bolt' } });
    await settle();
    const firstSignal = vi.mocked(searchScryfallCards).mock.calls[0][1];

    rerender({ q: 'bolts' });

    expect(firstSignal?.aborted).toBe(true);
  });

  it('surfaces a search failure', async () => {
    vi.mocked(searchScryfallCards).mockRejectedValue(new Error('Search failed: 500'));
    const { result } = renderHook(() => useScryfallCardSearch('bolt'));
    await settle();
    expect(result.current).toEqual({ results: [], loading: false, error: 'Search failed: 500' });
  });

  it('reports a failure without a message as an empty error, for the UI to word', async () => {
    vi.mocked(searchScryfallCards).mockRejectedValue('boom');
    const { result } = renderHook(() => useScryfallCardSearch('bolt'));
    await settle();
    expect(result.current).toEqual({ results: [], loading: false, error: '' });
  });
});
