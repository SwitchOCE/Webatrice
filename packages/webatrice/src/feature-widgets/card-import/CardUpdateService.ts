import { cardDatabaseService, type RebuildResult } from './CardDatabaseService';
import { CardSourceId } from './mergeCardSources';

/**
 * The upstream files desktop downloads (`oracle/src/pages.cpp`,
 * `spoiler_background_updater.cpp`). All four answer a browser `fetch` with
 * `Access-Control-Allow-Origin: *`, so they are fetched directly.
 */
export const UpstreamUrl = {
  TOKENS: 'https://raw.githubusercontent.com/Cockatrice/Magic-Token/master/tokens.xml',
  SPOILERS: 'https://raw.githubusercontent.com/Cockatrice/Magic-Spoiler/files/spoiler.xml',
  SPOILER_SEASON: 'https://raw.githubusercontent.com/Cockatrice/Magic-Spoiler/files/SpoilerSeasonEnabled',
  // Oracle builds cards.xml from MTGJSON AllPrintings (~100 MB compressed);
  // the browser only compares versions and points the user at Oracle.
  MTGJSON_META: 'https://www.mtgjson.com/api/v5/Meta.json',
} as const;

const FETCH_TIMEOUT_MS = 60_000;

export class UpdateFetchError extends Error {
  constructor(readonly url: string, readonly status?: number) {
    super(status ? `HTTP ${status}` : 'network');
    this.name = 'UpdateFetchError';
  }
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { cache: 'no-cache', signal: controller.signal });
  } catch {
    throw new UpdateFetchError(url);
  } finally {
    clearTimeout(timer);
  }
}

async function download(url: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchText(url, fetchImpl);
  if (!response.ok) {
    throw new UpdateFetchError(url, response.status);
  }
  return response.text();
}

export type SpoilerUpdateResult =
  | { status: 'season-ended'; removed: boolean; rebuild?: RebuildResult }
  | { status: 'up-to-date' }
  | { status: 'updated'; rebuild: RebuildResult };

export interface CardDatabaseVersionCheck {
  /** MTGJSON version Oracle would build from today. */
  latestVersion?: string;
  /** `<sourceVersion>` of the imported cards.xml, if any. */
  installedVersion?: string;
  updateAvailable: boolean;
}

/**
 * Browser counterpart of desktop's card update actions. Downloads replace a
 * source only after the new XML parsed, so a failed or offline update leaves
 * the database as it was.
 */
class CardUpdateService {
  // Late-bound so tests can stub the global.
  constructor(private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init)) {}

  /** Oracle's tokens step: replace tokens.xml with Magic-Token's. */
  async updateTokens(): Promise<RebuildResult> {
    const xml = await download(UpstreamUrl.TOKENS, this.fetchImpl);
    return cardDatabaseService.addSources([
      { fileName: 'tokens.xml', kind: 'tokens', xml, origin: 'url', url: UpstreamUrl.TOKENS },
    ]);
  }

  /**
   * `SpoilerBackgroundUpdater`: a 404 on the season flag means spoiler season
   * is over and spoiler.xml is dropped; otherwise download it and reload only
   * when it changed.
   */
  async updateSpoilers(): Promise<SpoilerUpdateResult> {
    const season = await fetchText(UpstreamUrl.SPOILER_SEASON, this.fetchImpl);
    if (season.status === 404) {
      const sources = await cardDatabaseService.listSources();
      const hasSpoilers = sources.some((s) => s.id === CardSourceId.SPOILER);
      if (!hasSpoilers) {
        return { status: 'season-ended', removed: false };
      }
      return { status: 'season-ended', removed: true, rebuild: await cardDatabaseService.removeSource(CardSourceId.SPOILER) };
    }
    if (!season.ok) {
      throw new UpdateFetchError(UpstreamUrl.SPOILER_SEASON, season.status);
    }

    const xml = await download(UpstreamUrl.SPOILERS, this.fetchImpl);
    if (await cardDatabaseService.hasSourceXml(CardSourceId.SPOILER, xml)) {
      return { status: 'up-to-date' };
    }
    const rebuild = await cardDatabaseService.addSources([
      { fileName: 'spoiler.xml', kind: 'spoiler', xml, origin: 'url', url: UpstreamUrl.SPOILERS },
    ]);
    return { status: 'updated', rebuild };
  }

  /** Desktop's "Check for Card Updates": compare the MTGJSON build Oracle would use. */
  async checkCardDatabase(): Promise<CardDatabaseVersionCheck> {
    const response = await fetchText(UpstreamUrl.MTGJSON_META, this.fetchImpl);
    if (!response.ok) {
      throw new UpdateFetchError(UpstreamUrl.MTGJSON_META, response.status);
    }
    const meta = await response.json() as { data?: { version?: string }; meta?: { version?: string } };
    const latestVersion = meta.data?.version ?? meta.meta?.version;
    const sources = await cardDatabaseService.listSources();
    const installedVersion = sources.find((s) => s.kind === 'main' || s.kind === 'legacy')?.sourceVersion;
    await cardDatabaseService.recordUpdateCheck();
    return {
      latestVersion,
      installedVersion,
      updateAvailable: Boolean(latestVersion && latestVersion !== installedVersion),
    };
  }
}

export { CardUpdateService };
export const cardUpdateService = new CardUpdateService();
