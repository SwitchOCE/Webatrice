const hoisted = vi.hoisted(() => ({
  addSources: vi.fn(),
  removeSource: vi.fn(),
  listSources: vi.fn(),
  hasSourceXml: vi.fn(),
  recordUpdateCheck: vi.fn(),
}));

vi.mock('./CardDatabaseService', () => ({ cardDatabaseService: hoisted }));

import { CardUpdateService, UpdateFetchError, UpstreamUrl } from './CardUpdateService';

const rebuild = { summary: { cards: 0, sets: 0, tokens: 1, formats: 0 }, unknownSets: [], allNewSetsEnabled: false };

function respond(map: Record<string, { status?: number; body?: string }>) {
  return vi.fn<typeof fetch>((input) => {
    const entry = map[String(input)];
    if (!entry) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(new Response(entry.body ?? '', { status: entry.status ?? 200 }));
  });
}

describe('CardUpdateService', () => {
  beforeEach(() => {
    hoisted.addSources.mockResolvedValue(rebuild);
    hoisted.removeSource.mockResolvedValue(rebuild);
    hoisted.listSources.mockResolvedValue([]);
    hoisted.hasSourceXml.mockResolvedValue(false);
  });

  it('replaces tokens.xml with the upstream download', async () => {
    const service = new CardUpdateService(respond({ [UpstreamUrl.TOKENS]: { body: '<tokens/>' } }));

    await expect(service.updateTokens()).resolves.toBe(rebuild);
    expect(hoisted.addSources).toHaveBeenCalledWith([
      { fileName: 'tokens.xml', kind: 'tokens', xml: '<tokens/>', origin: 'url', url: UpstreamUrl.TOKENS },
    ]);
  });

  it('leaves the database alone when the download fails', async () => {
    const service = new CardUpdateService(respond({ [UpstreamUrl.TOKENS]: { status: 503 } }));

    await expect(service.updateTokens()).rejects.toBeInstanceOf(UpdateFetchError);
    expect(hoisted.addSources).not.toHaveBeenCalled();
  });

  it('reports offline as a network error', async () => {
    const service = new CardUpdateService(respond({}));
    await expect(service.updateTokens()).rejects.toMatchObject({ message: 'network', url: UpstreamUrl.TOKENS });
  });

  describe('updateSpoilers', () => {
    it('downloads spoiler.xml during spoiler season', async () => {
      const service = new CardUpdateService(respond({
        [UpstreamUrl.SPOILER_SEASON]: { body: '1' },
        [UpstreamUrl.SPOILERS]: { body: '<spoilers/>' },
      }));

      await expect(service.updateSpoilers()).resolves.toEqual({ status: 'updated', rebuild });
      expect(hoisted.addSources).toHaveBeenCalledWith([
        expect.objectContaining({ fileName: 'spoiler.xml', kind: 'spoiler', xml: '<spoilers/>' }),
      ]);
    });

    it('skips the reload when the spoilers did not change', async () => {
      hoisted.hasSourceXml.mockResolvedValue(true);
      const service = new CardUpdateService(respond({
        [UpstreamUrl.SPOILER_SEASON]: { body: '1' },
        [UpstreamUrl.SPOILERS]: { body: '<spoilers/>' },
      }));

      await expect(service.updateSpoilers()).resolves.toEqual({ status: 'up-to-date' });
      expect(hoisted.addSources).not.toHaveBeenCalled();
    });

    it('drops spoiler.xml when the season flag is gone', async () => {
      hoisted.listSources.mockResolvedValue([{ id: 'spoiler', kind: 'spoiler' }]);
      const service = new CardUpdateService(respond({ [UpstreamUrl.SPOILER_SEASON]: { status: 404 } }));

      await expect(service.updateSpoilers()).resolves.toEqual({ status: 'season-ended', removed: true, rebuild });
      expect(hoisted.removeSource).toHaveBeenCalledWith('spoiler');
    });

    it('does nothing after the season when no spoilers are loaded', async () => {
      const service = new CardUpdateService(respond({ [UpstreamUrl.SPOILER_SEASON]: { status: 404 } }));
      await expect(service.updateSpoilers()).resolves.toEqual({ status: 'season-ended', removed: false });
      expect(hoisted.removeSource).not.toHaveBeenCalled();
    });
  });

  it('compares the installed cards.xml version with the MTGJSON build', async () => {
    hoisted.listSources.mockResolvedValue([{ id: 'main', kind: 'main', sourceVersion: '5.2.1' }]);
    const service = new CardUpdateService(respond({
      [UpstreamUrl.MTGJSON_META]: { body: JSON.stringify({ data: { version: '5.2.2' } }) },
    }));

    await expect(service.checkCardDatabase()).resolves.toEqual({
      latestVersion: '5.2.2',
      installedVersion: '5.2.1',
      updateAvailable: true,
    });
    expect(hoisted.recordUpdateCheck).toHaveBeenCalled();
  });
});
