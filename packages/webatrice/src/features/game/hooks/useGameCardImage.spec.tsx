import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Images } from '@app/images';
import { lookupCard, type CardDataPreferences, type Token } from '@app/services';
import { lookupGameCard, primeGameCards } from '../services/cardImages';
import { scryfallToLookup } from '../../../services/cards/catalog/scryfallCardMapper';
import { createAllRelated } from '../components/context-menus/CardContextMenu/relatedCardActions';
import { endSession } from '../../../services/session';
import type { ScryfallCard } from '../../../services/scryfall/types';
import Card from '../components/ui/SeatCard/SeatCard';
import { BigCardPreview } from '../components/ui/BigCardPreview/BigCardPreview';
import CardPreviewPane from '../components/CardPreviewPane/CardPreviewPane';
import { CardPreviewProvider, createCardPreviewStore } from '../components/ui/CardPreviewContext';
import { useSeatCardMetadata } from '../components/ui/PlayerBoard/useSeatCardMetadata';
import { DEFAULT_PICTURE_URL_TEMPLATES, expandPictureUrlTemplate } from '../../../services/cardDatabase/pictureUrlTemplates';

const preferences = vi.hoisted(() => ({
  value: undefined as CardDataPreferences | undefined,
  listener: undefined as ((value: CardDataPreferences) => void) | undefined,
}));
vi.mock('../../../services/cardDatabase/cardDataPreferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/cardDatabase/cardDataPreferences')>()),
  currentCardDataPreferences: async () => preferences.value,
  onCardDataPreferencesRefreshed: (listener: (value: CardDataPreferences) => void) => {
    preferences.listener = listener;
    return () => {};
  },
}));

const database = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  cards: new Map<string, unknown>(),
  tokens: [] as Token[],
  put: vi.fn(),
  readTokens: vi.fn(),
  readCard: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('../../../services/dexie', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/dexie')>()),
  dexieService: {
    cards: { get: async (name: string) => {
      database.readCard(name); return database.cards.get(name);
    }, bulkGet: async (names: string[]) => names.map((name) => database.cards.get(name)) },
    tokens: { toArray: () => database.readTokens() },
    scryfallCache: {
      get: async (name: string) => database.cache.get(name),
      bulkGet: async (names: string[]) => names.map((name) => database.cache.get(name)),
      put: async (record: { name: string }) => {
        database.put(record); database.cache.set(record.name, record);
      },
      bulkPut: (records: Array<{ name: string }>) => database.writeBatch(records),
    },
  } }));
vi.mock('@app/hooks', () => ({
  usePreference: () => false,
  useCardDataPreferences: () => ({ value: undefined }),
}));

let epoch = 0;
const id = '64f4dc68-aaaa-bbbb-cccc-111111111111';
const cdn = (side = 'front', printing = id) => `https://cards.scryfall.io/large/${side}/${printing[0]}/${printing[1]}/${printing}.jpg`;
const faceUri = (side: string) => cdn(side).replace('/large/', '/normal/') + '?12345';
const doubleToken = (front: string, back: string): ScryfallCard => ({
  id, name: `${front} // ${back}`, layout: 'double_faced_token',
  card_faces: [
    { name: front, image_uris: { normal: faceUri('front') } },
    { name: back, power: '1', toughness: '1', colors: ['W'], image_uris: { normal: faceUri('back') } },
  ],
});
const fakeCards = (record: ScryfallCard) => vi.fn(async (url: string) =>
  new Response(JSON.stringify(url.endsWith('/cards/collection') ? { data: [record] } : record)));
const art = (container: ParentNode) => container.querySelector('img')?.getAttribute('src');
const flush = async (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(epoch += 1_000_000);
  preferences.value = undefined;
  database.cache.clear();
  database.cards.clear();
  database.tokens = [];
  database.readTokens.mockImplementation(async () => database.tokens);
  database.writeBatch.mockImplementation(async (records: Array<{ name: string }>) => {
    records.forEach((record) => database.cache.set(record.name, record));
  });
  window.localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  endSession();
  vi.unstubAllGlobals();
});

it.each([
  ['Soldier Token ', doubleToken('Goblin', 'Soldier'), 'back'],
  ['Treasure (Token)', doubleToken('Dinosaur', 'Treasure'), 'back'],
  ['Zombie Token', doubleToken('Snake', 'Zombie'), 'back'],
  ['Goblin Token', doubleToken('Goblin', 'Soldier'), 'front'],
])('renders the matching art for %s on the board, hover, side pane and click preview', async (name, record, side) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(record)));
  vi.stubGlobal('fetch', fetchMock);
  const store = createCardPreviewStore();
  const view = render(<CardPreviewProvider store={store}>
    <Card name={name} />
    <BigCardPreview />
    <CardPreviewPane />
  </CardPreviewProvider>);
  expect(art(view.container.querySelector('.seat-card')!)).toBe(Images.Logo);
  await flush();
  expect(art(view.container.querySelector('.seat-card')!)).toBe(cdn(side));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain(`exact=${encodeURIComponent(name.trim().replace(/\s*\(?Token\)?$/i, ''))}`);
  fireEvent.mouseEnter(view.container.querySelector('.seat-card')!);
  await flush(400);
  expect(art(screen.getByTestId('hover-card-zoom'))).toBe(cdn(side));
  expect(art(screen.getByTestId('card-preview-pane'))).toBe(cdn(side));
  fireEvent.mouseDown(view.container.querySelector('.seat-card')!, { button: 1 });
  await flush(500);
  expect(art(screen.getByTestId('big-card-preview'))).toBe(cdn(side));
  expect([...document.querySelectorAll('img')].every((image) => !image.src.includes('api.scryfall.com'))).toBe(true);
  view.unmount();
  await flush();
});

it.each([true, false])('uses the same front URL for board and hover, with a wire id: %s', async (wireId) => {
  vi.stubGlobal('fetch', fakeCards({ id, name: 'Beast', type_line: 'Token Creature — Beast' }));
  const store = createCardPreviewStore();
  const view = render(<CardPreviewProvider store={store}>
    <Card name="Beast Token" scryfallId={wireId ? id : undefined} /><BigCardPreview />
  </CardPreviewProvider>);
  await flush();
  fireEvent.mouseEnter(view.container.querySelector('.seat-card')!);
  await flush(400);
  expect(art(screen.getByTestId('hover-card-zoom'))).toBe(art(view.container.querySelector('.seat-card')!));
  expect(art(screen.getByTestId('hover-card-zoom'))).toBe(cdn());
  expect(cdn()).toBe(expandPictureUrlTemplate(DEFAULT_PICTURE_URL_TEMPLATES[0], {
    name: 'Beast', set: { code: 'T', longName: 'Tokens', printing: { uuid: id } }, props: { side: 'front' }, lang: 'en',
  }));
  view.unmount();
  await flush();
});

it('recovers after a 429 without ever requesting a name-only image or remembering not-found', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 }))
    .mockResolvedValue(new Response(JSON.stringify({ id, name: 'Beast', type_line: 'Token Creature — Beast' })));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<Card name="Beast Token" />);
  await flush(29_999);
  expect(art(view.container)).toBe(Images.Logo);
  expect(database.put).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await flush(1);
  expect(art(view.container)).toBe(cdn());
  expect(database.cache.get('Beast Token')).toMatchObject({ found: true });
  expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('format=image'))).toBe(true);
  view.unmount();
});

it('keeps known-id art without retrying name lookups when metadata is offline', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<Card name="Beast Token" scryfallId={id} />);
  await flush(90_000);
  expect(art(view.container)).toBe(cdn());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  view.unmount();
});

it.each(['429', 'network'])('does not freeze seat metadata or persistent not-found after %s failure', async (failure) => {
  const fetchMock = failure === '429'
    ? vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    : vi.fn().mockRejectedValue(new TypeError('offline'));
  vi.stubGlobal('fetch', fetchMock);
  const cards = [{ name: 'Beast Token', id: '1', scryfallId: '', slot: { row: 0, col: 0 }, subSlot: 0, tapped: false }];
  const view = renderHook(({ battlefieldCards }) => useSeatCardMetadata({ isSelf: false, deckCards: [], battlefieldCards }), {
    initialProps: { battlefieldCards: cards },
  });
  await flush(failure === '429' ? 60_000 : 0);
  expect(database.put).not.toHaveBeenCalled();
  expect(view.result.current.cardMetaByName.has('Beast Token')).toBe(false);
  fetchMock.mockImplementation(fakeCards({ id, name: 'Beast', power: '3', toughness: '3' }));
  view.rerender({ battlefieldCards: [...cards] });
  await flush(failure === '429' ? 30_000 : 500);
  expect(view.result.current.cardMetaByName.get('Beast Token')).toMatchObject({ pt: '3/3' });
  view.unmount();
});

it('reads cached results by the requested token name and the canonical combined name', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(doubleToken('Goblin', 'Soldier'))));
  vi.stubGlobal('fetch', fetchMock);
  await lookupCard('Soldier Token');
  await flush();
  await lookupCard('Soldier Token');
  await lookupCard('Goblin // Soldier');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('preloads the same looked-up id and face as the board, with one metadata request', async () => {
  const preloaded: string[] = [];
  vi.spyOn(window, 'Image').mockImplementation(function image() {
    return { set src(value: string) {
      preloaded.push(value);
    } } as HTMLImageElement;
  } as unknown as () => HTMLImageElement);
  const fetchMock = fakeCards(doubleToken('Goblin', 'Soldier'));
  vi.stubGlobal('fetch', fetchMock);
  const deckCards = [{ name: 'Soldier Token', scryfallId: '', sideboard: false, commander: false }];
  function Seat() {
    const meta = useSeatCardMetadata({ isSelf: true, deckCards, battlefieldCards: [] });
    return <Card name="Soldier Token" scryfallId={deckCards[0].scryfallId}
      imageUri={meta.resolveFaceImageUri('Soldier Token')} />;
  }
  const view = render(<Seat />);
  await flush();
  expect(preloaded).toEqual([cdn('back')]);
  expect(art(view.container)).toBe(preloaded[0]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  view.unmount();
});

it.each(['wire', 'xml'] as const)('keeps the %s printing when the name lookup supplies another printing', async (source) => {
  const ownId = 'abcd1111-aaaa-bbbb-cccc-111111111111';
  const preloaded: string[] = [];
  vi.spyOn(window, 'Image').mockImplementation(function image() {
    return { set src(value: string) {
      preloaded.push(value);
    } } as HTMLImageElement;
  } as unknown as () => HTMLImageElement);
  if (source === 'xml') {
    database.cards.set('Soldier Token', { name: { value: 'Soldier Token' }, set: { value: 'T', uuid: ownId } });
  }
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/cards/collection')
    ? { data: [doubleToken('Goblin', 'Soldier')] }
    : { id: ownId, name: 'Soldier', image_uris: { large: cdn('front', ownId) } })));
  vi.stubGlobal('fetch', fetchMock);
  const deckCards = [{ name: 'Soldier Token', scryfallId: source === 'wire' ? ownId : '', sideboard: false, commander: false }];
  function Seat() {
    const meta = useSeatCardMetadata({ isSelf: true, deckCards, battlefieldCards: [] });
    return <Card name="Soldier Token" scryfallId={deckCards[0].scryfallId}
      imageUri={meta.resolveFaceImageUri('Soldier Token')} />;
  }
  const view = render(<Seat />);
  await flush(500);
  expect(preloaded).toEqual([cdn('front', ownId)]);
  expect(art(view.container)).toBe(preloaded[0]);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'https://api.scryfall.com/cards/collection', `https://api.scryfall.com/cards/${ownId}`,
  ]);
  view.unmount();
});

it('uses local token pictures before uuid while retaining Scryfall metadata', async () => {
  database.tokens = [{
    name: { value: 'Goblin (Token) ' }, set: { value: 'T', uuid: 'wrong-shared-id', picURL: cdn('back') + '?old' },
    prop: { value: { pt: { value: '9/9' } } },
  }];
  const record = { id: 'other', name: '_____ Goblin', power: '1', toughness: '1', colors: ['R'] };
  vi.stubGlobal('fetch', fakeCards(record));
  const view = render(<Card name="Goblin Token" />);
  const battlefieldCards = [{ name: 'Goblin Token', id: '1', scryfallId: '', slot: { row: 0, col: 0 }, subSlot: 0, tapped: false }];
  const meta = renderHook(() => useSeatCardMetadata({ isSelf: false, deckCards: [], battlefieldCards }));
  await flush(500);
  expect(art(view.container)).toBe(cdn('back'));
  expect(meta.result.current.cardMetaByName.get('Goblin Token')).toMatchObject({ pt: '1/1', colors: ['R'] });
  view.unmount();
  meta.unmount();
});

it('uses a local token uuid when it has no picture URL', async () => {
  database.tokens = [{ name: { value: 'Goblin Token ' }, set: { value: 'T', uuid: id } }];
  const record = { id: 'other', name: 'Goblin', type_line: 'Token Creature - Goblin' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(record))));
  const view = render(<Card name="Goblin" />);
  await flush();
  expect(art(view.container)).toBe(cdn());
  view.unmount();
});

it('keeps a valid wire printing and its matching face ahead of local token pictures and uuids', async () => {
  const wireId = 'abcd1111-aaaa-bbbb-cccc-111111111111';
  database.tokens = [{ name: { value: 'Soldier Token' }, set: { value: 'T', uuid: id, picURL: cdn() } }];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/cards/named')
    ? doubleToken('Goblin', 'Soldier')
    : { id: wireId, name: 'Goblin // Soldier', card_faces: [
      { name: 'Goblin', image_uris: { large: cdn('front', wireId) } },
      { name: 'Soldier', image_uris: { large: cdn('back', wireId) } },
    ] }))));
  const view = render(<Card name="Soldier Token" scryfallId={wireId} />);
  expect(art(view.container)).toBe(cdn('front', wireId));
  await flush(500);
  expect(art(view.container)).toBe(cdn('back', wireId));
  view.unmount();
});

it('does not replace a real Ornithopter with art from Ornithopter Token', async () => {
  const tokenId = 'abcd1111-aaaa-bbbb-cccc-111111111111';
  database.tokens = [{ name: { value: 'Ornithopter Token' }, set: { value: 'T', uuid: tokenId, picURL: cdn('front', tokenId) } }];
  const record = { id, name: 'Ornithopter', type_line: 'Artifact Creature — Thopter' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(record))));
  const view = render(<Card name="Ornithopter" />);
  await flush();
  expect(art(view.container)).toBe(cdn());
  expect((await lookupGameCard('Ornithopter')).token).toBeUndefined();
  view.unmount();
});

it('reads one token index per session and reuses successful lookups across mounts and names', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id, name: 'Soldier', type_line: 'Token Creature' }))));
  for (let i = 0; i < 3; i++) {
    const view = render(<Card name="Soldier Token" />);
    await flush();
    expect(art(view.container)).toBe(cdn());
    view.unmount();
  }
  await lookupGameCard(' Soldier Token ');
  expect(database.readCard).toHaveBeenCalledTimes(1);
  const anotherName = lookupGameCard('Treasure Token');
  await flush(500);
  await anotherName;
  expect(database.readCard).toHaveBeenCalledTimes(2);
  expect(database.readTokens).toHaveBeenCalledTimes(1);
  endSession();
  const nextSession = lookupGameCard('Soldier Token');
  await flush();
  await nextSession;
  expect(database.readCard).toHaveBeenCalledTimes(3);
  expect(database.readTokens).toHaveBeenCalledTimes(2);
});

it('does not retain a failed lookup as a successful session entry', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id, name: 'Beast', type_line: 'Token Creature — Beast' })));
  vi.stubGlobal('fetch', fetchMock);
  const first = lookupGameCard('Beast Token');
  await flush();
  expect((await first).card.found).toBe(false);
  const second = lookupGameCard('Beast Token');
  await flush(500);
  expect((await second).card.found).toBe(true);
  expect(database.readCard).toHaveBeenCalledTimes(2);
  expect(database.readTokens).toHaveBeenCalledTimes(1);
});

it('retries a failed token-table read instead of keeping a failed index for the session', async () => {
  database.readTokens.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
  vi.stubGlobal('fetch', fakeCards({ id, name: 'Beast', type_line: 'Token Creature — Beast' }));
  const first = lookupGameCard('Beast Token');
  await flush();
  await first;
  await lookupGameCard('Beast Token');
  expect(database.readTokens).toHaveBeenCalledTimes(2);
});

it.each(['invalid-id', 'x', '64f4dc68-aaaa-bbbb-cccc-11111111111z'])('ignores the invalid wire id %s', async (scryfallId) => {
  vi.stubGlobal('fetch', fakeCards({ id, name: 'Beast', type_line: 'Token Creature — Beast' }));
  const view = render(<Card name="Beast Token" scryfallId={scryfallId} />);
  expect(art(view.container)).toBe(Images.Logo);
  await flush();
  expect(art(view.container)).toBe(cdn());
  view.unmount();
});

it('keeps single-image split cards on the front even when their second name is selected', async () => {
  const record = { id, name: 'Fire // Ice', card_faces: [{ name: 'Fire' }, { name: 'Ice' }] };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(record))));
  const view = render(<Card name="Ice" scryfallId={id} />);
  await flush();
  expect(art(view.container)).toBe(cdn());
  view.unmount();
});

it('falls back once by id on a CDN error and resets when the printing changes', async () => {
  vi.stubGlobal('fetch', fakeCards({ id, name: 'Beast', type_line: 'Token Creature — Beast' }));
  const view = render(<Card name="Beast Token" scryfallId={id} />);
  await flush();
  fireEvent.error(view.container.querySelector('img')!);
  await flush(1000);
  expect(art(view.container)).toBe(cdn());
  fireEvent.error(view.container.querySelector('img')!);
  await flush(2000);
  expect(art(view.container)).toBe(cdn());
  fireEvent.error(view.container.querySelector('img')!);
  const fallback = `https://api.scryfall.com/cards/${id}?format=image&version=large&face=front`;
  expect(art(view.container)).toBe(fallback);
  fireEvent.error(view.container.querySelector('img')!);
  await flush(1000);
  expect(art(view.container)).toBe(Images.Logo);
  view.rerender(<Card name="Beast Token" scryfallId="abcd1111-aaaa-bbbb-cccc-111111111111" />);
  expect(art(view.container)).toBe(cdn('front', 'abcd1111-aaaa-bbbb-cccc-111111111111'));
  view.unmount();
});

it('settles on the logo after the wire printing fails without trying another printing', async () => {
  const wireId = 'abcd1111-aaaa-bbbb-cccc-111111111111';
  const fetchMock = fakeCards({ id, name: 'Beast', type_line: 'Token Creature — Beast' });
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<Card name="Beast Token" scryfallId={wireId} />);
  await flush();
  for (const delay of [1000, 2000]) {
    fireEvent.error(view.container.querySelector('img')!);
    expect(art(view.container)).toBe(Images.Logo);
    await flush(delay);
    expect(art(view.container)).toBe(cdn('front', wireId));
  }
  fireEvent.error(view.container.querySelector('img')!);
  expect(art(view.container)).toBe(`https://api.scryfall.com/cards/${wireId}?format=image&version=large&face=front`);
  fireEvent.error(view.container.querySelector('img')!);
  await flush(60_000);
  expect(art(view.container)).toBe(Images.Logo);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('keeps the resolved canonical face name on the token command and uses that face for art', async () => {
  const record = doubleToken('Goblin', 'Soldier');
  const canonical = { ...scryfallToLookup(record), name: 'Soldier Token' };
  const plan = createAllRelated({
    related: [{ name: 'Goblin // Soldier', scryfallId: id, origin: 'scryfall' }],
    tokenMeta: new Map([['Goblin // Soldier', canonical]]), parentMeta: {}, sourceCardId: 1, parentName: 'Maker',
  });
  expect(plan.requests[0].name).toBe('Soldier Token');
  expect(plan.lastToken?.name).toBe('Soldier Token');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(record))));
  const view = render(<Card name={plan.requests[0].name} scryfallId={plan.requests[0].providerId} />);
  await flush();
  expect(art(view.container)).toBe(cdn('back'));
  view.unmount();
});

it.each(['cold deck', 'stale deck', 'spectator board'])('batches 100 names for %s without named requests', async (mode) => {
  const names = Array.from({ length: 100 }, (_, i) => `Deck Card ${i}`);
  const card = (name: string) => ({ id, name, type_line: 'Creature', power: '2', toughness: '2' });
  if (mode === 'stale deck') {
    for (const name of names) {
      database.cache.set(name, { ...scryfallToLookup(card(name)), fetchedAt: Date.now() - 86_400_001 });
    }
  }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.endsWith('/cards/collection')) {
      throw new Error('Unexpected per-name request');
    }
    const { identifiers } = JSON.parse(String(init?.body)) as { identifiers: Array<{ name: string }> };
    return new Response(JSON.stringify({ data: identifiers.map(({ name }) => card(name)) }));
  });
  vi.stubGlobal('fetch', fetchMock);
  let deckCards = names.map((name) => ({ name, scryfallId: '', sideboard: false, commander: false }));
  const battlefieldCards = mode === 'spectator board'
    ? names.map((name, i) => ({ name, id: String(i), scryfallId: '', slot: { row: 0, col: i }, subSlot: 0, tapped: false })) : [];
  let metadata: ReturnType<typeof useSeatCardMetadata> | undefined;
  function Seat() {
    metadata = useSeatCardMetadata({ isSelf: mode !== 'spectator board', deckCards, battlefieldCards });
    return <><Card name={names[0]} /><Card name={names[99]} /></>;
  }
  const view = render(<Seat />);
  await flush(499);
  expect(metadata?.cardMetaByName.size).toBe(0);
  await flush(501);
  expect(metadata?.cardMetaByName.size).toBe(100);
  expect([...view.container.querySelectorAll('img')].map((image) => image.getAttribute('src'))).toEqual([cdn(), cdn()]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).identifiers.length)).toEqual([75, 25]);
  deckCards = [...deckCards];
  view.rerender(<Seat />);
  await flush(1000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  view.unmount();
});

it('loads a newly created token while the deck prime is still in flight', async () => {
  const names = Array.from({ length: 100 }, (_, i) => `Deck Card ${i}`);
  const finish: Array<() => void> = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/cards/collection')) {
      const { identifiers } = JSON.parse(String(init?.body)) as { identifiers: Array<{ name: string }> };
      return new Promise<Response>((resolve) => finish.push(() => resolve(new Response(JSON.stringify({
        data: identifiers.map(({ name }) => ({ id, name })),
      })))));
    }
    expect(url).toBe('https://api.scryfall.com/cards/named?exact=Beast');
    return Promise.resolve(new Response(JSON.stringify({ id, name: 'Beast', type_line: 'Token Creature — Beast' })));
  }));
  const prime = primeGameCards(names);
  await flush();
  const view = render(<Card name="Beast Token" />);
  await flush(1000);
  expect(art(view.container)).toBe(cdn());
  expect(finish).toHaveLength(2);
  expect(database.cache.has(names[0])).toBe(false);
  finish.forEach((resolve) => resolve());
  await flush();
  await prime;
  view.unmount();
});

it('recovers from a 429 during priming and renders token art without a named request', async () => {
  const fetchMock = fakeCards({ id, name: 'Beast', type_line: 'Token Creature — Beast' });
  fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }));
  vi.stubGlobal('fetch', fetchMock);
  const battlefieldCards = [{ name: 'Beast Token', id: '1', scryfallId: '', slot: { row: 0, col: 0 }, subSlot: 0, tapped: false }];
  function Seat() {
    useSeatCardMetadata({ isSelf: false, deckCards: [], battlefieldCards });
    return <Card name="Beast Token" />;
  }
  const view = render(<Seat />);
  await flush(29_999);
  expect(art(view.container)).toBe(Images.Logo);
  expect(database.cache.size).toBe(0);
  await flush(1);
  expect(art(view.container)).toBe(cdn());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.every(([url]) => url.endsWith('/cards/collection'))).toBe(true);
  expect(database.cache.get('Beast Token')).toMatchObject({ found: true });
  view.unmount();
});

it('uses one genuine batch-miss named retry, then reads the cached requested name', async () => {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/cards/collection')
    ? { data: [] } : { id, name: 'Beast', type_line: 'Token Creature — Beast' })));
  vi.stubGlobal('fetch', fetchMock);
  const prime = primeGameCards(['Beast Token']);
  const view = render(<Card name="Beast Token" />);
  await flush(500);
  await prime;
  expect(art(view.container)).toBe(cdn());
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    'https://api.scryfall.com/cards/collection', 'https://api.scryfall.com/cards/named?exact=Beast',
  ]);
  view.unmount();
});

it('renders the batch result without waiting for a cache write or making a per-name read', async () => {
  let finish!: () => void;
  database.writeBatch.mockImplementationOnce((records: Array<{ name: string }>) => new Promise<void>((resolve) => {
    finish = () => {
      records.forEach((record) => database.cache.set(record.name, record));
      resolve();
    };
  }));
  const fetchMock = fakeCards({ id, name: 'Beast', type_line: 'Token Creature — Beast' });
  vi.stubGlobal('fetch', fetchMock);
  const prime = primeGameCards(['Beast Token']);
  const view = render(<Card name="Beast Token" />);
  await flush(500);
  expect(art(view.container)).toBe(cdn());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(database.readCard).not.toHaveBeenCalled();
  finish();
  await flush();
  await prime;
  expect(art(view.container)).toBe(cdn());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  view.unmount();
});

it.each([
  ['Goblin', { name: '_____ Goblin', layout: 'normal', type_line: 'Creature — Goblin Guest', power: '2', toughness: '2' },
    { ...doubleToken('Goblin', 'Soldier'), type_line: 'Token Creature — Goblin // Token Creature — Soldier' }, 'front'],
  ['Spirit', { name: 'Spirit', layout: 'front_card', type_line: 'Card', power: undefined, toughness: undefined },
    { id, name: 'Spirit', layout: 'token', type_line: 'Token Creature — Spirit', power: '1', toughness: '1' }, 'front'],
  ['Soldier', { name: 'Soldier', layout: 'front_card', type_line: 'Card' },
    { ...doubleToken('Goblin', 'Soldier'), type_line: 'Token Creature — Goblin // Token Creature — Soldier' }, 'back'],
] as const)('searches token art for %s when the named lookup is a different kind of record', async (name, named, token, side) => {
  const wrongId = 'abcd1111-aaaa-bbbb-cccc-111111111111';
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/cards/search')
    ? { data: [{ id: wrongId, name: 'Unrelated', type_line: 'Token Creature' }, token] } : { id: wrongId, ...named })));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<Card name={`${name} Token`} />);
  await flush(500);
  expect(art(view.container)).toBe(cdn(side));
  const search = new URL(fetchMock.mock.calls[1][0]);
  expect(search.pathname).toBe('/cards/search');
  expect(search.searchParams.get('q')).toBe(`t:token !"${name}"`);
  expect(search.searchParams.get('include_extras')).toBe('true');
  view.unmount();
  const next = render(<Card name={`${name} Token`} />);
  await flush(1000);
  expect(art(next.container)).toBe(cdn(side));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect((await lookupGameCard(`${name} Token`)).card.name).toBe(named.name);
  next.unmount();
});

it('remembers a custom token 404 and an empty token search across board changes', async () => {
  const fetchMock = vi.fn(async (url: string) => url.endsWith('/cards/collection')
    ? new Response(JSON.stringify({ data: [] })) : new Response('', { status: 404 }));
  vi.stubGlobal('fetch', fetchMock);
  const emptyDeck: [] = [];
  const board = [{ name: 'Custom Token', id: '1', scryfallId: '', slot: { row: 0, col: 0 }, subSlot: 0, tapped: false }];
  function Seat({ cards }: { cards: typeof board }) {
    useSeatCardMetadata({ isSelf: false, deckCards: emptyDeck, battlefieldCards: cards });
    return <Card name="Custom Token" />;
  }
  const view = render(<Seat cards={board} />);
  await flush(1000);
  expect(art(view.container)).toBe(Images.Logo);
  expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/cards/collection', '/cards/named', '/cards/search',
  ]);
  expect((await lookupGameCard('Custom Token')).card.notFound).toBe(true);
  for (const revision of [2, 3, 4]) {
    view.rerender(<Seat cards={board.map((card) => ({ ...card, id: String(revision) }))} />);
    await flush(30_000);
  }
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(database.put).not.toHaveBeenCalled();
  view.unmount();
});

it('retries a rate-limited token search instead of remembering it as an empty result', async () => {
  let limited = true;
  const fetchMock = vi.fn(async (url: string) => url.includes('/cards/search')
    ? limited ? new Response('', { status: 429 })
      : new Response(JSON.stringify({ data: [{ id, name: 'Spirit', layout: 'token', type_line: 'Token Creature — Spirit' }] }))
    : new Response(JSON.stringify({ id: 'front-card', name: 'Spirit', layout: 'front_card', type_line: 'Card' })));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<Card name="Spirit Token" />);
  await flush(60_500);
  expect(art(view.container)).toBe(Images.Logo);
  limited = false;
  await flush(30_000);
  expect(art(view.container)).toBe(cdn());
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/cards/search'))).toHaveLength(4);
  view.unmount();
});

it('does not fetch printing detail when the selected face is the first face', async () => {
  const wireId = 'abcd1111-aaaa-bbbb-cccc-111111111111';
  const fetchMock = fakeCards(doubleToken('Goblin', 'Soldier'));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<Card name="Goblin Token" scryfallId={wireId} />);
  await flush(1000);
  expect(art(view.container)).toBe(cdn('front', wireId));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('uses a mid-session printing pin after preferences refresh without a wire id', async () => {
  const pinnedId = 'abcd1111-aaaa-bbbb-cccc-111111111111';
  preferences.value = { cardOverrides: {}, setPreferences: new Map(), setLongNames: new Map(), pictureUrlTemplates: [] };
  preferences.listener?.(preferences.value);
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/cards/collection')
    ? { data: [{ id: pinnedId, name: 'Opt', type_line: 'Instant' }] }
    : { id, name: 'Opt', type_line: 'Instant' })));
  vi.stubGlobal('fetch', fetchMock);
  const first = render(<Card name="Opt" />);
  await flush();
  expect(art(first.container)).toBe(cdn());
  first.unmount();
  preferences.value = { ...preferences.value, cardOverrides: { Opt: pinnedId } };
  preferences.listener?.(preferences.value);
  const next = render(<Card name="Opt" />);
  await flush(500);
  expect(art(next.container)).toBe(cdn('front', pinnedId));
  expect((await lookupGameCard('Opt')).card.pinnedPrintingId).toBe(pinnedId);
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/cards/named'))).toHaveLength(1);
  next.unmount();
});
