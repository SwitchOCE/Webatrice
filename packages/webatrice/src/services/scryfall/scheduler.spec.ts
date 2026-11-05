import { createScryfallScheduler } from './scheduler';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('spaces starts exactly across callers while a response is still pending', async () => {
  const starts: Array<[string, number]> = [];
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    starts.push([url, Date.now()]);
    return url === 'first' ? new Promise<Response>((resolve) => {
      finish = resolve;
    }) : Promise.resolve(new Response('{}'));
  }));
  const request = createScryfallScheduler();
  const first = request('first');
  const second = request('second');
  const third = request('third');
  await vi.advanceTimersByTimeAsync(99);
  expect(starts).toEqual([['first', 0]]);
  await vi.advanceTimersByTimeAsync(1);
  expect(starts).toEqual([['first', 0], ['second', 100]]);
  await vi.advanceTimersByTimeAsync(100);
  expect(starts).toEqual([['first', 0], ['second', 100], ['third', 200]]);
  finish(new Response('{}'));
  await Promise.all([first, second, third]);
});

it.each(['2', 'Thu, 01 Jan 1970 00:00:02 GMT', null])('backs off the entire queue for Retry-After %s', async (header) => {
  const starts: Array<[string, number]> = [];
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    starts.push([url, Date.now()]);
    return Promise.resolve(starts.length === 1
      ? new Response('', { status: 429, headers: header ? { 'Retry-After': header } : undefined })
      : new Response('{}'));
  }));
  const request = createScryfallScheduler();
  const first = request('first');
  const second = request('second');
  await vi.advanceTimersByTimeAsync(29999);
  expect(starts).toEqual([['first', 0]]);
  await vi.advanceTimersByTimeAsync(1);
  expect(starts).toEqual([['first', 0], ['first', 30000]]);
  await vi.advanceTimersByTimeAsync(100);
  expect(starts).toEqual([['first', 0], ['first', 30000], ['second', 30100]]);
  await Promise.all([first, second]);
});

it.each(['45', 'Thu, 01 Jan 1970 00:00:45 GMT'])('honours a wait longer than 30 seconds: %s', async (header) => {
  const starts: number[] = [];
  vi.stubGlobal('fetch', vi.fn(() => {
    starts.push(Date.now());
    return Promise.resolve(starts.length === 1
      ? new Response('', { status: 429, headers: { 'Retry-After': header } })
      : new Response('{}'));
  }));
  const result = createScryfallScheduler()('card');
  await vi.advanceTimersByTimeAsync(44999);
  expect(starts).toEqual([0]);
  await vi.advanceTimersByTimeAsync(1);
  expect(starts).toEqual([0, 45000]);
  await result;
});

it('rejects after two retries and preserves the final 30-second pause', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
  vi.stubGlobal('fetch', fetchMock);
  const request = createScryfallScheduler();
  const result = request('card').catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(60000);
  expect(await result).toMatchObject({ status: 429 });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  fetchMock.mockResolvedValue(new Response('{}'));
  const next = request('next');
  await vi.advanceTimersByTimeAsync(29999);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);
  await next;
});

it.each(['999999999999', 'Thu, 01 Jan 2099 00:00:00 GMT', '9'.repeat(400)])('caps Retry-After %s at 60 seconds', async (header) => {
  const starts: number[] = [];
  vi.stubGlobal('fetch', vi.fn(() => {
    starts.push(Date.now());
    return Promise.resolve(starts.length === 1
      ? new Response('', { status: 429, headers: { 'Retry-After': header } })
      : new Response('{}'));
  }));
  const request = createScryfallScheduler();
  const first = request('first');
  const queued = request('queued');
  await vi.advanceTimersByTimeAsync(59_999);
  expect(starts).toEqual([0]);
  await vi.advanceTimersByTimeAsync(1);
  expect(starts).toEqual([0, 60_000]);
  await vi.advanceTimersByTimeAsync(100);
  await Promise.all([first, queued]);
  expect(starts).toEqual([0, 60_000, 60_100]);
});

it('spaces named, collection and search starts by 500ms while keeping other starts at 100ms', async () => {
  const starts: number[] = [];
  vi.stubGlobal('fetch', vi.fn(() => {
    starts.push(Date.now());
    return Promise.resolve(new Response('{}'));
  }));
  const request = createScryfallScheduler();
  const requests = [
    request('https://api.scryfall.com/cards/named?exact=Soldier'),
    request('https://api.scryfall.com/cards/collection'),
    request('https://api.scryfall.com/cards/known-id'),
    request('https://api.scryfall.com/cards/search?q=token'),
    request('https://api.scryfall.com/cards/named?exact=Treasure'),
  ];
  await vi.advanceTimersByTimeAsync(1499);
  expect(starts).toEqual([0, 500, 600, 1000]);
  await vi.advanceTimersByTimeAsync(1);
  expect(starts).toEqual([0, 500, 600, 1000, 1500]);
  await Promise.all(requests);
});

it('removes an aborted queued request and aborts an active fetch', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
    signals.push(init.signal!);
    return new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  }));
  const request = createScryfallScheduler();
  const active = new AbortController();
  const queued = new AbortController();
  const first = request('first', { signal: active.signal }).catch((error: unknown) => error);
  const second = request('second', { signal: queued.signal }).catch((error: unknown) => error);
  queued.abort();
  await vi.advanceTimersByTimeAsync(100);
  expect(signals).toHaveLength(1);
  active.abort();
  expect(await first).toMatchObject({ name: 'AbortError' });
  expect(await second).toMatchObject({ name: 'AbortError' });
  expect(signals[0].aborted).toBe(true);
});

it('removes a cancelled retry while preserving the global backoff for other callers', async () => {
  const starts: Array<[string, number]> = [];
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    starts.push([url, Date.now()]);
    return Promise.resolve(url === 'limited'
      ? new Response('', { status: 429, headers: { 'Retry-After': '2' } })
      : new Response('{}'));
  }));
  const request = createScryfallScheduler();
  const controller = new AbortController();
  const cancelled = request('limited', { signal: controller.signal }).catch((error: unknown) => error);
  const next = request('next');
  await vi.advanceTimersByTimeAsync(10);
  controller.abort();
  expect(await cancelled).toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(29989);
  expect(starts).toEqual([['limited', 0]]);
  await vi.advanceTimersByTimeAsync(1);
  expect(starts).toEqual([['limited', 0], ['next', 30000]]);
  await next;
});
