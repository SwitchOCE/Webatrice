import { clearBracketSourceCaches, fetchGameChangers } from '../../features/decks/bracketSources';
import { scryfallSearchUrl, searchCards, searchScryfallPage } from '../../features/decks/search';
import { fetchPricesForCards } from '../../features/decks/pricing';
import { fetchScryfallDetail } from './cardDetail';
import { fetchCollection, fetchNamedCard, fetchPrintings, SCRYFALL_API } from './client';

let epoch = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(epoch += 1_000_000);
  clearBracketSourceCaches();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('uses one queue for catalogue, collection, metadata, printings, both searches and brackets', async () => {
  const started: Array<[string, number]> = [];
  const start = Date.now();
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    started.push([url.replace(SCRYFALL_API, ''), Date.now() - start]);
    return Promise.resolve(new Response(JSON.stringify({ id: 'card', name: 'Named', data: [] })));
  }));
  const requests = [
    fetchNamedCard('Named'),
    fetchCollection([{ name: 'Collected' }]),
    fetchScryfallDetail('detail', 'Detail'),
    fetchPrintings('Printed'),
    searchScryfallPage(scryfallSearchUrl('advanced')),
    searchCards('auto'),
    fetchGameChangers(),
  ];
  await vi.advanceTimersByTimeAsync(99);
  expect(started).toEqual([['/cards/named?exact=Named', 0]]);
  await vi.advanceTimersByTimeAsync(1901);
  expect(started).toEqual([
    ['/cards/named?exact=Named', 0],
    ['/cards/collection', 500],
    ['/cards/detail', 600],
    ['/cards/search?q=!%22Printed%22&unique=prints&order=released&dir=desc', 1000],
    ['/cards/search?q=advanced&unique=cards&order=name', 1500],
    ['/cards/autocomplete?q=auto', 1600],
    ['/cards/search?q=is%3Agamechanger&order=name&unique=cards', 2000],
  ]);
  await Promise.all(requests);
});

it.each([
  ['named', () => fetchNamedCard('Limited')],
  ['collection', () => fetchCollection([{ name: 'Limited collection' }])],
  ['metadata', () => fetchScryfallDetail('limited-detail', '')],
  ['printings', () => fetchPrintings('Limited printings')],
  ['autocomplete', () => searchCards('limited')],
  ['pricing', () => fetchPricesForCards([{ name: 'Limited price' }])],
] as const)('surfaces exhausted 429 from %s', async (_name, request) => {
  const starts: number[] = [];
  const start = Date.now();
  vi.stubGlobal('fetch', vi.fn(() => {
    starts.push(Date.now() - start);
    return Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '1' } }));
  }));
  const result = request().catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(60000);
  expect(starts).toEqual([0, 30000, 60000]);
  expect(await result).toMatchObject({ status: 429 });
});
