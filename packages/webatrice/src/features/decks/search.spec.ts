import { searchCardAsPreview, searchCardImage, searchCards, searchScryfallCards, type ScryfallSearchCard } from './search';

function json(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchCards', () => {
  it('autocompletes queries of two or more characters, capped at the limit', async () => {
    const fetchMock = vi.fn(async () => json({ data: ['Risen Reef', 'Risen Riptide', 'Risen Executioner'] }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await searchCards('r')).toEqual([]);
    expect(await searchCards(' risen ', 2)).toEqual([
      { name: 'Risen Reef', source: 'scryfall' },
      { name: 'Risen Riptide', source: 'scryfall' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('https://api.scryfall.com/cards/autocomplete?q=risen');
  });

  it('returns no suggestions on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, false)));
    expect(await searchCards('risen')).toEqual([]);
  });
});

describe('searchScryfallCards', () => {
  it('searches unique cards by name order and treats a 404 as no results', async () => {
    const fetchMock = vi.fn(async (_url: string) => json({}, false));
    vi.stubGlobal('fetch', fetchMock);

    expect(await searchScryfallCards('c:r t:instant')).toEqual([]);
    expect(fetchMock.mock.calls[0][0])
      .toBe('https://api.scryfall.com/cards/search?q=c%3Ar%20t%3Ainstant&unique=cards&order=name');
  });

  it('rethrows an abort so the caller can ignore it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }));
    await expect(searchScryfallCards('bolt')).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('search results as previews', () => {
  const dfc: ScryfallSearchCard = {
    id: 'id-1',
    name: 'Delver of Secrets // Insectile Aberration',
    type_line: 'Creature',
    mana_cost: '{U}',
    set: 'isd',
    collector_number: '51',
    card_faces: [{ image_uris: { small: 'front-small' } }],
  };

  it('uses the card image, else the front face', () => {
    expect(searchCardImage({ ...dfc, image_uris: { small: 's', normal: 'n' } })).toBe('n');
    expect(searchCardImage(dfc)).toBe('front-small');
  });

  it('builds a not-in-deck card for the sidebar preview', () => {
    expect(searchCardAsPreview(dfc)).toEqual({
      name: dfc.name,
      quantity: 1,
      category: 'main',
      typeLine: 'Creature',
      manaCost: '{U}',
      set: 'isd',
      collectorNumber: '51',
      scryfallId: 'id-1',
      imageUri: 'front-small',
      lookupSource: 'scryfall',
    });
  });
});
