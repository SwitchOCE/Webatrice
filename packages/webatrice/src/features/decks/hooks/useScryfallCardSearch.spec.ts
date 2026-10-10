import { act, renderHook } from '@testing-library/react';

import { SEARCH_DEBOUNCE_MS, useScryfallCardSearch } from './useScryfallCardSearch';

const fetchMock = vi.fn();
let clock = Date.now();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  clock += 60_000;
  vi.setSystemTime(clock);
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

  it('keeps a not_found response empty without an error', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 404, json: async () => ({ object: 'error', code: 'not_found' }),
    });
    const { result } = renderHook(() => useScryfallCardSearch('bolt'));
    await settle();
    expect(result.current).toEqual({ results: [], loading: false, error: null });
  });

  it('surfaces an HTTP 500 as a typed failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useScryfallCardSearch('bolt'));
    await settle();
    expect(result.current).toEqual({ results: [], loading: false, error: { kind: 'failed' } });
  });

  it('stays loading through HTTP 429 retries, then surfaces the exhausted failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const { result } = renderHook(() => useScryfallCardSearch('bolt'));

    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ results: [], loading: true, error: null });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ results: [], loading: true, error: null });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current).toEqual({ results: [], loading: false, error: { kind: 'failed' } });
  });

  it('surfaces network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useScryfallCardSearch('bolt'));
    await settle();
    expect(result.current).toEqual({ results: [], loading: false, error: { kind: 'failed' } });
  });

  it.each(['new query', '  '])('clears a bad-query error immediately when the query becomes "%s"', async (q) => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 400,
      json: async () => ({ object: 'error', code: 'bad_request', details: 'Unknown color: purple' }),
    });
    const { result, rerender } = renderHook(({ query }) => useScryfallCardSearch(query), {
      initialProps: { query: 'c:purple' },
    });
    await settle();
    expect(result.current.error).toEqual({ kind: 'badQuery', details: 'Unknown color: purple' });
    rerender({ query: q });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(Boolean(q.trim()));
    await settle();
    expect(result.current).toEqual({ results: [], loading: false, error: null });
  });

  it.each(['pending', 'completed', 'cleared'])('ignores a stale failure while the next search is %s', async (state) => {
    let rejectOld!: (reason: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectOld = reject;
    }));
    const cards = [{ id: 'b', name: 'Lightning Bolt' }];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: cards }) });
    const { result, rerender } = renderHook(({ q }) => useScryfallCardSearch(q), {
      initialProps: { q: 'old' },
    });
    await settle();
    rerender({ q: state === 'cleared' ? '' : 'bolt' });
    if (state === 'completed') {
      await settle();
    }
    await act(async () => {
      rejectOld(new TypeError('Late failure'));
    });
    expect(result.current).toEqual({
      results: state === 'completed' ? cards : [], loading: state === 'pending', error: null,
    });
    await settle();
  });

  it('ignores stale successful results', async () => {
    let resolveOld!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOld = resolve;
    }));
    const { result, rerender } = renderHook(({ q }) => useScryfallCardSearch(q), {
      initialProps: { q: 'old' },
    });
    await settle();
    rerender({ q: '' });
    await act(async () => {
      resolveOld({ ok: true, json: async () => ({ data: [{ id: 'old', name: 'Old card' }] }) });
    });
    expect(result.current).toEqual({ results: [], loading: false, error: null });
  });

  it('does not report an abort as a failure', async () => {
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const { result } = renderHook(() => useScryfallCardSearch('bolt'));
    await settle();
    expect(result.current).toEqual({ results: [], loading: false, error: null });
  });
});
