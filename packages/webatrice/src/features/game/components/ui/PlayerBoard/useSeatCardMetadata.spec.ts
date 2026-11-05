import { createElement } from 'react';
import { endSession } from '@app/services/session';
import { render, renderHook, waitFor } from '@testing-library/react';
import type { LookupResult } from '@app/services';

import type { BattlefieldCardViewModel, SeatDeckCard } from './playerBoard.types';
import { seatCardMetaFromLookup, useSeatCardMetadata, type UseSeatCardMetadataArgs } from './useSeatCardMetadata';
import { lookupGameCard, primeGameCards } from '../../../services/cardImages';
import Card from '../SeatCard/SeatCard';

const catalog = vi.hoisted(() => ({
  lookupCard: vi.fn(),
  lookupCards: vi.fn(),
  preferences: { cardOverrides: {} as Record<string, string> },
}));

vi.mock('@app/hooks', () => ({
  useCardDataPreferences: () => ({ value: catalog.preferences }),
  usePreference: () => false,
}));

vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  ...catalog,
}));

afterEach(endSession);

const record = (name: string, extra: Partial<LookupResult> = {}): LookupResult => ({
  found: true,
  source: 'scryfall',
  name,
  printings: [{ scryfallId: `${name}-id` }],
  ...extra,
});

const BEAR = record('Bear', { typeLine: 'Creature — Bear', power: '2', toughness: '2', cmc: 2, colors: ['G'] });
const MAKER = record('Maker', { typeLine: 'Creature', related: [{ name: 'Goblin', component: 'token', origin: 'scryfall' }] });
const DFC = record('Delver', {
  layout: 'transform',
  faces: [{ name: 'Delver', imageUri: 'front.jpg' }, { name: 'Insectile Aberration', imageUri: 'back.jpg' }],
});
const RECORDS: Record<string, LookupResult> = { Bear: BEAR, Maker: MAKER, Delver: DFC };

const battlefieldCard = (id: number, name: string): BattlefieldCardViewModel => ({
  id: String(id),
  name,
  scryfallId: '',
  slot: { row: 0, col: id },
  subSlot: 0,
  tapped: false,
});

const NO_DECK: readonly SeatDeckCard[] = [];
const NO_BATTLEFIELD: readonly BattlefieldCardViewModel[] = [];

function renderMetadata(args: Partial<UseSeatCardMetadataArgs> = {}) {
  return renderHook(() => useSeatCardMetadata({
    isSelf: true,
    deckCards: NO_DECK,
    battlefieldCards: NO_BATTLEFIELD,
    ...args,
  }));
}

beforeEach(() => {
  catalog.preferences = { cardOverrides: {} };
  catalog.lookupCard.mockImplementation(async (name: string) => RECORDS[name] ?? record(name));
  catalog.lookupCards.mockImplementation(async (names: string[]) =>
    new Map(await Promise.all(names.filter((n) => n !== 'Unknown token').map(async (n) =>
      [n, await catalog.lookupCard.getMockImplementation()!(n)] as const))));
});

describe('seatCardMetaFromLookup', () => {
  it('keeps the catalog fields the seat reads and joins the printed P/T', () => {
    expect(seatCardMetaFromLookup(BEAR)).toEqual({
      typeLine: 'Creature — Bear',
      pt: '2/2',
      manaCost: undefined,
      cmc: 2,
      colors: ['G'],
      power: '2',
      toughness: '2',
      related: undefined,
      layout: undefined,
      faces: undefined,
    });
    expect(seatCardMetaFromLookup(record('Shock'))).toMatchObject({ typeLine: '', pt: undefined });
    expect(seatCardMetaFromLookup({ ...BEAR, tableRow: 0 })).toMatchObject({ tableRow: 0 });
  });
});

describe('useSeatCardMetadata', () => {
  it('looks up the own deck list once per name, and none for another seat', async () => {
    const deckCards: SeatDeckCard[] = [
      { name: 'Bear', scryfallId: 'b1111111-aaaa-bbbb-cccc-111111111111', sideboard: false, commander: false },
      { name: 'Bear', scryfallId: 'b1111111-aaaa-bbbb-cccc-111111111111', sideboard: false, commander: false },
      { name: 'Maker', scryfallId: '', sideboard: true, commander: false },
    ];
    const { result } = renderMetadata({ deckCards });
    await waitFor(() => expect(result.current.cardMetaByName.get('Maker')?.typeLine).toBe('Creature'));
    expect(catalog.lookupCard).not.toHaveBeenCalled();
    expect(catalog.lookupCards).toHaveBeenCalledWith(['Bear', 'Maker']);
    expect(result.current.cardMetaByName.get('Bear')?.pt).toBe('2/2');

    catalog.lookupCard.mockClear();
    renderMetadata({ isSelf: false, deckCards });
    expect(catalog.lookupCard).not.toHaveBeenCalled();
  });

  it('preloads the own main-deck images with the same looked-up printing as the board', async () => {
    const images: string[] = [];
    const ImageSpy = vi.spyOn(window, 'Image').mockImplementation(function image(this: HTMLImageElement) {
      Object.defineProperty(this, 'src', { set: (src: string) => images.push(src) });
      return this;
    } as unknown as () => HTMLImageElement);
    renderMetadata({
      deckCards: [
        { name: 'Bear', scryfallId: 'b1111111-aaaa-bbbb-cccc-111111111111', sideboard: false, commander: false },
        { name: 'Maker', scryfallId: '', sideboard: false, commander: false },
        { name: 'Delver', scryfallId: 'd', sideboard: true, commander: false },
      ],
    });
    await waitFor(() => expect(images).toEqual([
      'https://cards.scryfall.io/large/front/b/1/b1111111-aaaa-bbbb-cccc-111111111111.jpg',
      'https://cards.scryfall.io/large/front/M/a/Maker-id.jpg',
    ]));
    ImageSpy.mockRestore();
  });

  it('enriches battlefield cards on any seat, then the tokens they relate to', async () => {
    const { result } = renderMetadata({ isSelf: false, battlefieldCards: [battlefieldCard(1, 'Maker'), battlefieldCard(2, 'Bear')] });
    await waitFor(() => expect(result.current.tokenMetaByName.get('Goblin')?.found).toBe(true));
    expect(catalog.lookupCards).toHaveBeenCalledWith(['Goblin']);
    expect(result.current.describeCard('Bear')).toEqual({
      name: 'Bear',
      typeLine: 'Creature — Bear',
      cmc: 2,
      colors: ['G'],
      power: '2',
      toughness: '2',
    });
  });

  it('uses the current exact-name pin for cached related-token metadata', async () => {
    catalog.preferences = { cardOverrides: { Goblin: 'pin-a' } };
    const { result, rerender } = renderMetadata({ battlefieldCards: [battlefieldCard(1, 'Maker')] });
    await waitFor(() => expect(result.current.tokenMetaByName.get('Goblin')?.pinnedPrintingId).toBe('pin-a'));
    catalog.preferences = { cardOverrides: { Goblin: 'pin-b' } };
    rerender();
    expect(result.current.tokenMetaByName.get('Goblin')?.pinnedPrintingId).toBe('pin-b');
    expect(catalog.lookupCards.mock.calls.filter(([names]) => names.length === 1 && names[0] === 'Goblin')).toHaveLength(1);
  });

  it.each([404, 429])('remembers a related-token 404 but retries a 429 after board growth: %s', async (status) => {
    const lonely = record('Lonely', { related: [{ name: 'Unknown token', origin: 'scryfall' }] });
    catalog.lookupCard.mockImplementation(async (name: string) => name === 'Lonely' ? lonely : record(name));
    const batch = catalog.lookupCards.getMockImplementation()!;
    let attempts = 0;
    catalog.lookupCards.mockImplementation(async (names: string[]) => {
      if (!names.includes('Unknown token')) {
        return batch(names);
      }
      attempts++;
      if (status === 429 && attempts === 1) {
        throw Object.assign(new Error('Rate limited'), { status: 429 });
      }
      return new Map([['Unknown token', status === 404
        ? { found: false, notFound: true, source: 'unknown', name: 'Unknown token', printings: [] } : record('Unknown token')]]);
    });
    const { result, rerender } = renderHook(({ battlefieldCards }) => useSeatCardMetadata({
      isSelf: false, deckCards: NO_DECK, battlefieldCards,
    }), { initialProps: { battlefieldCards: [battlefieldCard(1, 'Lonely')] } });
    await waitFor(() => expect(attempts).toBe(1));
    if (status === 404) {
      await waitFor(() => expect(result.current.tokenMetaByName.get('Unknown token')?.notFound).toBe(true));
    } else {
      expect(result.current.tokenMetaByName.has('Unknown token')).toBe(false);
    }
    rerender({ battlefieldCards: [battlefieldCard(1, 'Lonely'), battlefieldCard(2, 'Extra')] });
    await waitFor(() => expect(result.current.cardMetaByName.has('Extra')).toBe(true));
    if (status === 429) {
      await waitFor(() => expect(result.current.tokenMetaByName.get('Unknown token')?.found).toBe(true));
    }
    expect(attempts).toBe(status === 404 ? 1 : 2);
  });

  it('resolves the face image of a transformed card, and nothing for a single-faced one', async () => {
    const { result } = renderMetadata({ battlefieldCards: [battlefieldCard(1, 'Delver'), battlefieldCard(2, 'Bear')] });
    await waitFor(() => expect(result.current.cardMetaByName.has('Delver')).toBe(true));
    expect(result.current.resolveFaceImageUri('Insectile Aberration')).toBeUndefined();
    expect(result.current.resolveFaceImageUri('Delver')).toBe('front.jpg');
    expect(result.current.resolveFaceImageUri('Bear')).toBeUndefined();
  });

  it('matches a token face after cleaning suffixes and spaces, using its Scryfall P/T and colours', async () => {
    catalog.lookupCard.mockResolvedValue(record('Goblin // Soldier', {
      faces: [{ name: 'Goblin', imageUri: 'goblin.jpg' }, {
        name: 'Soldier', imageUri: 'soldier.jpg', power: '1', toughness: '1', colors: ['W'],
      }],
    }));
    const { result } = renderMetadata({ battlefieldCards: [battlefieldCard(1, 'Soldier (Token) ')] });
    await waitFor(() => expect(result.current.cardMetaByName.has('Soldier (Token) ')).toBe(true));
    expect(result.current.resolveFaceImageUri('Soldier (Token) ')).toBe('soldier.jpg');
    expect(result.current.cardMetaByName.get('Soldier (Token) ')).toMatchObject({ pt: '1/1', colors: ['W'] });
  });
});

it('renders a board face through a mocked batch prime before any per-name cache read', async () => {
  const id = '64f4dc68-aaaa-bbbb-cccc-111111111111';
  const face = `https://cards.scryfall.io/large/back/6/4/${id}.jpg`;
  const cached = new Map<string, LookupResult>();
  catalog.lookupCards.mockImplementation(async (names: string[]) => {
    for (const name of names) {
      cached.set(name, record('Goblin // Soldier', {
        layout: 'double_faced_token', printings: [{ scryfallId: id }], faces: [{ name: 'Goblin' }, { name: 'Soldier', imageUri: face }],
      }));
    }
    return new Map(cached);
  });
  catalog.lookupCard.mockImplementation(async (name: string) => {
    const hit = cached.get(name);
    if (!hit) {
      throw new Error('Unexpected unprimed name lookup');
    }
    return hit;
  });
  const battlefieldCards = [battlefieldCard(1, 'Soldier Token')];
  function Seat() {
    useSeatCardMetadata({ isSelf: false, deckCards: NO_DECK, battlefieldCards });
    return createElement(Card, { name: 'Soldier Token' });
  }
  const view = render(createElement(Seat));
  await waitFor(() => expect(view.container.querySelector('.seat-card img')).toHaveAttribute('src', face));
  expect(catalog.lookupCards).toHaveBeenCalledExactlyOnceWith(['Soldier Token']);
  expect(catalog.lookupCard).not.toHaveBeenCalled();
});

it('releases a rejected prime and permits another batch for an unresolved name', async () => {
  catalog.lookupCards.mockRejectedValueOnce(new Error('Rate limited'));
  catalog.lookupCard.mockResolvedValue({ found: false, source: 'unknown', name: 'Retry Token', printings: [] });
  await primeGameCards(['Retry Token']);
  expect((await lookupGameCard('Retry Token')).card.found).toBe(false);
  await primeGameCards(['Retry Token']);
  expect(catalog.lookupCards).toHaveBeenCalledTimes(2);
});

it('does not batch a name already cached successfully this session', async () => {
  await lookupGameCard('Cached');
  await primeGameCards(['Cached', 'New']);
  expect(catalog.lookupCards).toHaveBeenCalledExactlyOnceWith(['New']);
});
