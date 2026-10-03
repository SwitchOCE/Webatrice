import {
  canAddBrowsedCard,
  describeCardDetail,
  detailTargetKey,
  fetchScryfallDetail,
  resolveDetailRow,
  selectCardFace,
  type ScryfallDetail,
} from './cardDetail';
import type { DeckCard } from './types';

function card(name: string, overrides: Partial<DeckCard> = {}): DeckCard {
  return { name, quantity: 1, category: 'main', lookupSource: 'scryfall', ...overrides };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchScryfallDetail', () => {
  it('fetches by id when known, else by exact name without a Token suffix', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ id: 'x', name: 'X' }) }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchScryfallDetail('abc', 'Ignored');
    await fetchScryfallDetail(undefined, 'Soldier Token');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.scryfall.com/cards/abc',
      'https://api.scryfall.com/cards/named?exact=Soldier',
    ]);
  });

  it('passes the caller\'s abort signal as the only request option', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ id: 'x', name: 'X' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const { signal } = new AbortController();

    await fetchScryfallDetail('abc', 'Ignored', signal);
    await fetchScryfallDetail(undefined, 'Fire // Ice');

    expect(fetchMock.mock.calls).toEqual([
      ['https://api.scryfall.com/cards/abc', { signal }],
      [`https://api.scryfall.com/cards/named?exact=${encodeURIComponent('Fire // Ice')}`, { signal: undefined }],
    ]);
  });

  it('returns null on an HTTP or network failure and rethrows an abort', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await fetchScryfallDetail(undefined, 'X')).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    expect(await fetchScryfallDetail(undefined, 'X')).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }));
    await expect(fetchScryfallDetail(undefined, 'X')).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('selectCardFace', () => {
  const detail: ScryfallDetail = {
    id: 'd',
    name: 'Delver of Secrets // Insectile Aberration',
    card_faces: [{ name: 'Delver of Secrets' }, { name: 'Insectile Aberration' }],
  };

  it('matches exactly, ignoring case', () => {
    expect(selectCardFace(detail, 'insectile aberration')?.name).toBe('Insectile Aberration');
  });

  it('matches after stripping a Token suffix, then by containment either way', () => {
    const tokens: ScryfallDetail = {
      id: 't',
      name: 'Human Soldier // Goblin',
      card_faces: [{ name: 'Goblin' }, { name: 'Human Soldier' }],
    };
    expect(selectCardFace(tokens, 'Human Soldier Token')?.name).toBe('Human Soldier');
    expect(selectCardFace(tokens, 'Elite Human Soldier')?.name).toBe('Human Soldier');
    expect(selectCardFace(tokens, 'Soldier')?.name).toBe('Human Soldier');
  });

  it('falls back to the first face, and to none for single-faced cards', () => {
    expect(selectCardFace(detail, 'Something Else')?.name).toBe('Delver of Secrets');
    expect(selectCardFace({ id: 's', name: 'Sol Ring' }, 'Sol Ring')).toBeUndefined();
    expect(selectCardFace(null, 'Sol Ring')).toBeUndefined();
  });
});

describe('resolveDetailRow', () => {
  const deck = [card('Negate', { category: 'sideboard' }), card('Negate'), card('Sol Ring')];

  it('finds the clicked row by name and zone', () => {
    expect(resolveDetailRow(deck, card('Negate', { category: 'sideboard' }), null)).toBe(0);
    expect(resolveDetailRow(deck, card('Gone'), null)).toBe(-1);
  });

  it('prefers the main row of a browsed card', () => {
    expect(resolveDetailRow(deck, card('Sol Ring'), { name: 'Negate', kind: 'combo_piece' })).toBe(1);
    expect(resolveDetailRow([card('Negate', { category: 'sideboard' })], card('X'), { name: 'Negate', kind: 'combo_piece' }))
      .toBe(0);
  });
});

describe('describeCardDetail', () => {
  const transform: ScryfallDetail = {
    id: 'd',
    name: 'Delver of Secrets // Insectile Aberration',
    cmc: 1,
    set: 'isd',
    collector_number: '51',
    card_faces: [
      { name: 'Delver of Secrets', mana_cost: '{U}', type_line: 'Creature — Human Wizard', image_uris: { normal: 'front' } },
      { name: 'Insectile Aberration', type_line: 'Creature — Human Insect', oracle_text: 'Flying', image_uris: { normal: 'back' } },
    ],
  };

  it('shows a back face with its own art and text and no inherited CMC', () => {
    const face = selectCardFace(transform, 'Insectile Aberration');
    expect(describeCardDetail({ detail: transform, face, activeName: 'Insectile Aberration', liveCard: null, fallback: {} }))
      .toEqual({
        name: 'Insectile Aberration',
        imageUrl: 'back',
        typeLine: 'Creature — Human Insect',
        oracle: 'Flying',
        flavor: '',
        manaCost: '',
        cmc: undefined,
        setCode: 'isd',
        collectorNumber: '51',
      });
  });

  it('falls back to the deck row before Scryfall has answered', () => {
    const row = card('Sol Ring', { typeLine: 'Artifact', manaCost: '{1}', cmc: 1, set: 'c21', collectorNumber: '263' });
    expect(describeCardDetail({ detail: null, face: undefined, activeName: 'Sol Ring', liveCard: row, fallback: row }))
      .toEqual(expect.objectContaining({ typeLine: 'Artifact', manaCost: '{1}', cmc: 1, setCode: 'c21', imageUrl: undefined }));
  });
});

describe('detail helpers', () => {
  it('keys a target by id, else by name', () => {
    expect(detailTargetKey({ name: 'X', scryfallId: 'id' })).toBe('id');
    expect(detailTargetKey({ name: 'X' })).toBe('name:X');
  });

  it('only offers to add meld parts and combo pieces', () => {
    expect(['face', 'token', 'meld_part', 'meld_result', 'combo_piece'].filter((k) =>
      canAddBrowsedCard(k as Parameters<typeof canAddBrowsedCard>[0]))).toEqual(['meld_part', 'combo_piece']);
  });
});
