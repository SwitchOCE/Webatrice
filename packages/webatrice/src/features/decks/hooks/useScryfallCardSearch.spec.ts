import { act, renderHook } from '@testing-library/react';

import { SEARCH_DEBOUNCE_MS, useScryfallCardSearch } from './useScryfallCardSearch';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ results: [], loading: false, error: null });
  });

  it('searches the trimmed query after the debounce', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'b', name: 'Lightning Bolt' }] }) });
    const { result } = renderHook(() => useScryfallCardSearch('bolt c:r '));
    expect(result.current.loading).toBe(true);

    await settle();

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.scryfall.com/cards/search?q=bolt%20c%3Ar&unique=cards&order=name');
    expect(result.current).toEqual({ results: [{ id: 'b', name: 'Lightning Bolt' }], loading: false, error: null });
  });

  it('aborts the previous request when the query changes', async () => {
    const { rerender } = renderHook(({ q }) => useScryfallCardSearch(q), { initialProps: { q: 'bolt' } });
    await settle();
    const firstSignal = fetchMock.mock.calls[0][1].signal;

    rerender({ q: 'bolts' });

    expect(firstSignal?.aborted).toBe(true);
  });

  it.each([404, 500])('keeps HTTP %s responses empty without a hook error', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status });
    const { result } = renderHook(() => useScryfallCardSearch('bolt'));
    await settle();
    expect(result.current).toEqual({ results: [], loading: false, error: null });
  });

  it('keeps network failures empty without a hook error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useScryfallCardSearch('bolt'));
    await settle();
    expect(result.current).toEqual({ results: [], loading: false, error: null });
  });
});
