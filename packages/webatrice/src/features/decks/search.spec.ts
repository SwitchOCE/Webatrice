import { searchCardAsPreview, searchCardImage, searchCards, searchScryfallCards, type ScryfallSearchCard } from './search';

function json(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response;
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
    const fetchMock = vi.fn(async (_url: string) => json({ object: 'error', code: 'not_found' }, false, 404));
    vi.stubGlobal('fetch', fetchMock);

    expect(await searchScryfallCards('c:r t:instant')).toEqual([]);
    expect(fetchMock.mock.calls[0][0])
      .toBe('https://api.scryfall.com/cards/search?q=c%3Ar%20t%3Ainstant&unique=cards&order=name');
  });

  it('carries Scryfall details for a bad query', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      object: 'error', code: 'bad_request', details: 'Unknown color: purple',
    }, false, 400)));
    await expect(searchScryfallCards('c:purple')).rejects.toMatchObject({
      failure: { kind: 'badQuery', details: 'Unknown color: purple' },
    });
  });

  it.each([429, 500, 503, 404])('rejects HTTP %s without a not_found error object', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, false, status)));
    await expect(searchScryfallCards('bolt')).rejects.toMatchObject({ failure: { kind: 'failed' } });
  });

  it('rejects a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(searchScryfallCards('bolt')).rejects.toMatchObject({ failure: { kind: 'failed' } });
  });

  it('rejects an unreadable error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => {
        throw new SyntaxError('Invalid JSON');
      },
    }));
    await expect(searchScryfallCards('bolt')).rejects.toMatchObject({ failure: { kind: 'failed' } });
  });

  it('rethrows an abort so the caller can ignore it', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(searchScryfallCards('bolt')).rejects.toBe(abort);
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
