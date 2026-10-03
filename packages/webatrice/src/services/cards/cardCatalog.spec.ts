import type { Mock } from 'vitest';

import { dexieService } from '../dexie';
import { fetchAllPrintings, lookupCard, lookupCards, lookupCardsCached } from './cardCatalog';

vi.mock('../dexie', () => ({
  dexieService: {
    cards: { get: vi.fn(), bulkGet: vi.fn() },
    scryfallCache: { get: vi.fn(), bulkGet: vi.fn(), put: vi.fn(), bulkPut: vi.fn() },
  },
}));

// Dexie's Table typings return PromiseExtended; the mocks only need plain promises.
const cards = dexieService.cards as unknown as { get: Mock; bulkGet: Mock };
const cache = dexieService.scryfallCache as unknown as { get: Mock; bulkGet: Mock; put: Mock; bulkPut: Mock };

// A cards.xml record as the Cockatrice XML parser stores it: `{ value }` leaves,
// and a single repeated tag collapsed to an object.
const XML_SWAN_SONG = {
  name: { value: 'Swan Song' },
  prop: {
    value: {
      type: { value: 'Instant' },
      manacost: { value: 'U' },
      cmc: { value: '1' },
      colors: { value: 'U' },
    },
  },
  set: { value: 'THS', num: '65', uuid: 'xml-uuid', picurl: 'https://mirror/swan.jpg' },
  related: { value: 'Bird', count: '1' },
};

const SCRYFALL_SWAN_SONG = {
  id: 'sf-id',
  name: 'Swan Song',
  layout: 'normal',
  type_line: 'Instant',
  set: 'ths',
  collector_number: '65',
  image_uris: { normal: 'https://cards/swan.jpg' },
  all_parts: [
    { id: 'bird-id', component: 'token', name: 'Bird', uri: '' },
    { id: 'combo-id', component: 'combo_piece', name: 'Something', uri: '' },
  ],
};

function respond(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => respond({}, false, 404));
  vi.stubGlobal('fetch', fetchMock);
  cards.get.mockResolvedValue(undefined);
  cards.bulkGet.mockImplementation(async (names: string[]) => names.map(() => undefined));
  cache.get.mockResolvedValue(undefined);
  cache.bulkGet.mockImplementation(async (names: string[]) => names.map(() => undefined));
  cache.put.mockResolvedValue(undefined);
  cache.bulkPut.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupCard', () => {
  it('returns the unknown fallback when neither Dexie nor Scryfall knows the card', async () => {
    await expect(lookupCard('Nonexistent')).resolves.toEqual({
      found: false,
      source: 'unknown',
      name: 'Nonexistent',
      printings: [],
    });
  });

  it('reads cards.xml cipt (comes into play tapped)', async () => {
    cards.get.mockResolvedValue({ ...XML_SWAN_SONG, name: { value: 'Tapland' }, cipt: { value: '1' } });
    await expect(lookupCard('Tapland')).resolves.toMatchObject({ cipt: true });

    cards.get.mockResolvedValue(XML_SWAN_SONG);
    expect(await lookupCard('Swan Song')).not.toHaveProperty('cipt');
  });

  it('merges cards.xml base fields with Scryfall related cards and writes the cache', async () => {
    cards.get.mockResolvedValue(XML_SWAN_SONG);
    fetchMock.mockImplementation(() => respond(SCRYFALL_SWAN_SONG));

    const result = await lookupCard('Swan Song');

    expect(fetchMock).toHaveBeenCalledWith('https://api.scryfall.com/cards/named?exact=Swan%20Song');
    expect(result).toMatchObject({
      found: true,
      source: 'dexie+scryfall',
      typeLine: 'Instant',
      manaCost: 'U',
      cmc: 1,
      colors: ['U'],
      printings: [{ set: 'THS', collectorNumber: '65', scryfallId: 'xml-uuid', imageUri: 'https://mirror/swan.jpg' }],
      layout: 'normal',
    });
    // Scryfall's token entry wins (it carries the image id); cards.xml's count is overlaid.
    // combo_piece parts are never surfaced.
    expect(result.related).toEqual([
      { name: 'Bird', component: 'token', origin: 'scryfall', scryfallId: 'bird-id', count: '1', persistent: undefined, attach: undefined },
    ]);
    expect(cache.put).toHaveBeenCalledWith(expect.objectContaining({ name: 'Swan Song', source: 'scryfall' }));
  });

  it('serves a cached Scryfall record without fetching and drops stale combo pieces', async () => {
    cache.get.mockResolvedValue({
      found: true,
      source: 'scryfall',
      name: 'Delver of Secrets',
      printings: [],
      related: [{ name: 'Insectile Aberration', component: 'combo_piece', origin: 'scryfall' }],
    });

    const result = await lookupCard('Delver of Secrets');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ source: 'scryfall', name: 'Delver of Secrets' });
    expect(result.related).toBeUndefined();
  });

  it('strips a trailing "Token" suffix before the exact-name request', async () => {
    await lookupCard('Goblin Token');
    expect(fetchMock).toHaveBeenCalledWith('https://api.scryfall.com/cards/named?exact=Goblin');
  });
});

describe('lookupCards', () => {
  it('dedupes names, batches one collection request preferring set + collector number, and caches hits', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/cards/collection')
        ? respond({
          data: [
            { id: 'a', name: 'Opt', set: 'xln', collector_number: '65' },
            { id: 'b', name: 'Fire // Ice', set: 'mh2', collector_number: '290' },
          ],
        })
        : respond({}, false, 404));

    const result = await lookupCards([{ name: 'Opt', set: 'XLN', collectorNumber: '65' }, 'Opt', 'Fire']);

    const collectionCalls = fetchMock.mock.calls.filter(([url]) => url === 'https://api.scryfall.com/cards/collection');
    expect(collectionCalls).toHaveLength(1);
    expect(JSON.parse(collectionCalls[0][1].body)).toEqual({
      identifiers: [{ set: 'xln', collector_number: '65' }, { name: 'Fire' }],
    });
    expect([...result.keys()]).toEqual(['Opt', 'Fire']);
    expect(result.get('Opt')).toMatchObject({ found: true, source: 'scryfall', printings: [{ scryfallId: 'a' }] });
    // Split cards match on their front face.
    expect(result.get('Fire')).toMatchObject({ found: true, name: 'Fire // Ice' });
    expect(cache.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Opt' }),
      expect.objectContaining({ name: 'Fire // Ice' }),
    ]);
  });

  it('retries batch misses one by one through the exact-name endpoint', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/cards/collection')
        ? respond({ data: [] })
        : url.includes('exact=Brainstorm')
          ? respond({ id: 'bs', name: 'Brainstorm' })
          : respond({}, false, 404));

    const result = await lookupCards(['Brainstorm', 'Missing']);

    expect(result.get('Brainstorm')).toMatchObject({ found: true, source: 'scryfall' });
    expect(result.get('Missing')).toEqual({ found: false, source: 'unknown', name: 'Missing', printings: [] });
  });

  it('skips per-name retries when more than 50 names are unresolved (no request storm)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockImplementation(() => respond({}, false, 500));
    const names = Array.from({ length: 51 }, (_, i) => `Card ${i}`);

    const result = await lookupCards(names);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...result.values()].every((r) => r.source === 'unknown')).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('51 names unresolved'));
    warn.mockRestore();
  });

  it('does not fetch names already in the Scryfall cache', async () => {
    cache.bulkGet.mockImplementation(async (names: string[]) =>
      names.map((n) => (n === 'Cached' ? { found: true, source: 'scryfall', name: 'Cached', printings: [] } : undefined)));

    const result = await lookupCards(['Cached']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.get('Cached')).toMatchObject({ found: true });
  });
});

describe('lookupCardsCached', () => {
  it('memoizes found cards for the session but never unknown ones', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/cards/collection')
        ? respond({ data: [{ id: 'p', name: 'Ponder' }] })
        : respond({}, false, 404));

    await lookupCardsCached(['Ponder', 'Unknowable']);
    const firstFetches = fetchMock.mock.calls.length;
    const again = await lookupCardsCached(['Ponder', 'Unknowable']);

    expect(again.get('Ponder')).toMatchObject({ found: true });
    expect(again.get('Unknowable')).toMatchObject({ source: 'unknown' });
    // Only the unknown name is looked up again.
    const repeatBody = JSON.parse(fetchMock.mock.calls[firstFetches][1].body);
    expect(repeatBody).toEqual({ identifiers: [{ name: 'Unknowable' }] });
  });
});

describe('fetchAllPrintings', () => {
  it('maps every printing from an exact-name search, newest first', async () => {
    fetchMock.mockImplementation(() => respond({
      data: [
        { id: 'new', name: 'Opt', set: 'dmr', collector_number: '1', image_uris: { normal: 'n.jpg' } },
        { id: 'old', name: 'Opt', set: 'inv', collector_number: '64', card_faces: [{ image_uris: { small: 's.jpg' } }] },
      ],
    }));

    await expect(fetchAllPrintings('Opt')).resolves.toEqual([
      { set: 'dmr', collectorNumber: '1', scryfallId: 'new', imageUri: 'n.jpg' },
      { set: 'inv', collectorNumber: '64', scryfallId: 'old', imageUri: 's.jpg' },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent('!"Opt"')}&unique=prints&order=released&dir=desc`,
    );
  });

  it('returns an empty list on a failed request', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    await expect(fetchAllPrintings('Opt')).resolves.toEqual([]);
  });
});
