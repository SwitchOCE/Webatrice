import { act, renderHook, waitFor } from '@testing-library/react';

import { fetchAllPrintings } from '@app/services';

import { ScryfallRateLimitError } from '../../services/scryfall/scheduler';
import { useCardPrintings } from './hooks/useCardPrintings';

const storage = vi.hoisted(() => {
  const rows = new Map<string, { key: string; info: { usd: number | null; tcgplayer: string | null }; fetchedAt: number }>();
  return { rows, bulkGet: vi.fn(), bulkPut: vi.fn(), post: vi.fn() };
});

vi.mock('../../services/dexie/DexieService', () => ({
  dexieService: { scryfallPrices: { bulkGet: storage.bulkGet, bulkPut: storage.bulkPut } },
}));
vi.mock('../../services/scryfall/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/scryfall/client')>(),
  postCollection: storage.post,
}));
vi.mock('@app/services', () => ({
  fetchAllPrintings: vi.fn(),
  lookupCard: vi.fn(),
}));

const card = { scryfallId: 'bolt-id', name: 'Lightning Bolt' };
const response = (usd = '2.00') => ({ ok: true, json: async () => ({ data: [
  { id: card.scryfallId, name: card.name, prices: { usd }, purchase_uris: { tcgplayer: 'https://tcg/bolt' } },
] }) });
const reload = async () => {
  vi.resetModules();
  return (await import('./pricing')).fetchPricesForCards;
};

beforeEach(() => {
  storage.rows.clear();
  storage.bulkGet.mockReset().mockImplementation(async (keys: string[]) => keys.map((key) => storage.rows.get(key)));
  storage.bulkPut.mockReset().mockImplementation(async (rows: Array<(typeof storage.rows extends Map<string, infer R> ? R : never)>) => {
    rows.forEach((row) => storage.rows.set(row.key, structuredClone(row)));
  });
  storage.post.mockReset().mockResolvedValue(response());
  vi.mocked(fetchAllPrintings).mockReset().mockResolvedValue([card]);
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
});

it('restores both id and name prices after reload without fetching within 24 hours', async () => {
  const first = await reload();
  await first([card]);
  expect(storage.post).toHaveBeenCalledOnce();
  vi.mocked(Date.now).mockReturnValue(1_800_000_000_000 + 24 * 60 * 60 * 1000 - 1);
  storage.post.mockClear();
  const second = await reload();
  const result = await second([card]);
  expect(result.byId.get(card.scryfallId)?.usd).toBe(2);
  expect(result.byName.get('lightning bolt')?.usd).toBe(2);
  expect(storage.post).not.toHaveBeenCalled();
});

it('paints stale prices immediately and refreshes at the 24-hour boundary', async () => {
  await (await reload())([card]);
  vi.mocked(Date.now).mockReturnValue(1_800_000_000_000 + 24 * 60 * 60 * 1000);
  let resolve!: (value: ReturnType<typeof response>) => void;
  storage.post.mockImplementation(() => new Promise((done) => {
    resolve = done;
  }));
  const progress = vi.fn();
  const done = (await reload())([card], progress);
  await vi.waitFor(() => expect(progress).toHaveBeenCalled());
  expect(progress.mock.calls[0][0].byId.get(card.scryfallId)?.usd).toBe(2);
  expect(storage.post).toHaveBeenCalledTimes(2);
  resolve(response('3.00'));
  expect((await done).byId.get(card.scryfallId)?.usd).toBe(3);
  expect(storage.rows.get('id:bolt-id')?.fetchedAt).toBe(Date.now());
});

it('also expires the in-memory entries and coalesces concurrent refreshes', async () => {
  const fetchPrices = await reload();
  await fetchPrices([card]);
  vi.mocked(Date.now).mockReturnValue(1_800_000_000_000 + 24 * 60 * 60 * 1000);
  storage.post.mockResolvedValue(response('4.00'));
  const results = await Promise.all([fetchPrices([card]), fetchPrices([card])]);
  expect(storage.post).toHaveBeenCalledTimes(2);
  expect(results.map((result) => result.byName.get('lightning bolt')?.usd)).toEqual([4, 4]);
});

it('uses the network when IndexedDB reads fail', async () => {
  await (await reload())([card]);
  storage.bulkGet.mockRejectedValue(new Error('unavailable'));
  const result = await (await reload())([card]);
  expect(storage.post).toHaveBeenCalledTimes(2);
  expect(result.byId.get(card.scryfallId)?.usd).toBe(2);
});

it('keeps fetched prices usable if IndexedDB writes fail', async () => {
  storage.bulkPut.mockRejectedValue(new Error('quota'));
  const fetchPrices = await reload();
  expect((await fetchPrices([card])).byId.get(card.scryfallId)?.usd).toBe(2);
  await fetchPrices([card]);
  expect(storage.post).toHaveBeenCalledOnce();
  await (await reload())([card]);
  expect(storage.post).toHaveBeenCalledTimes(2);
});

it('keeps stale Dexie prices in the printing picker after a failed refresh and retries on reopening', async () => {
  storage.rows.set('id:bolt-id', {
    key: 'id:bolt-id', info: { usd: 2, tcgplayer: null }, fetchedAt: Date.now() - 24 * 60 * 60 * 1000,
  });
  storage.post.mockResolvedValue({ ok: false });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const first = renderHook(() => useCardPrintings(card.name));
  await waitFor(() => expect(storage.post).toHaveBeenCalledOnce());
  expect(first.result.current.prices.byId.get(card.scryfallId)?.usd).toBe(2);
  first.unmount();

  const second = renderHook(() => useCardPrintings(card.name));
  await waitFor(() => expect(storage.post).toHaveBeenCalledTimes(2));
  expect(second.result.current.prices.byId.get(card.scryfallId)?.usd).toBe(2);
});

it('stops fetching in the picker after a rate limit', async () => {
  const printings = Array.from({ length: 76 }, (_, i) => ({ scryfallId: `picker-limit-${i}` }));
  vi.mocked(fetchAllPrintings).mockResolvedValue(printings);
  storage.post.mockReset();
  storage.post.mockRejectedValueOnce(new ScryfallRateLimitError());
  const { result } = renderHook(() => useCardPrintings('Limit Test'));
  await waitFor(() => expect(storage.post).toHaveBeenCalledTimes(1));
  await act(async () => new Promise((done) => setTimeout(done, 20)));

  expect(storage.post).toHaveBeenCalledTimes(1);
  expect(result.current.error).toBeNull();
});

it('keeps later chunk prices in the picker after an earlier http failure', async () => {
  const printings = Array.from({ length: 76 }, (_, i) => ({ scryfallId: `picker-http-${i}` }));
  vi.mocked(fetchAllPrintings).mockResolvedValue(printings);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  storage.post.mockReset();
  storage.post.mockResolvedValueOnce({ ok: false });
  let resolve!: (res: ReturnType<typeof response>) => void;
  storage.post.mockImplementationOnce(() => new Promise((done) => {
    resolve = done;
  }));
  const { result } = renderHook(() => useCardPrintings('Chunk Test'));
  await waitFor(() => expect(storage.post).toHaveBeenCalledTimes(2));
  expect(storage.post.mock.calls[1][0]).toEqual(printings.slice(74).map((p) => ({ id: p.scryfallId })));

  await act(async () => resolve({
    ok: true,
    json: async () => ({ data: [{
      id: printings[75].scryfallId, name: 'Chunk Test', prices: { usd: '3.00' },
      purchase_uris: { tcgplayer: 'https://tcg/chunk' },
    }] }),
  }));

  expect(result.current.prices.byId.get(printings[75].scryfallId)?.usd).toBe(3);
  expect(result.current.error).toBeNull();
  expect(storage.rows.get(`id:${printings[75].scryfallId}`)?.info.usd).toBe(3);
});
