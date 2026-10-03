import { dexieService } from '../../dexie';
import type { LookupResult } from './types';

/**
 * The Dexie `scryfallCache` table: a Scryfall-shaped read-through cache of
 * `LookupResult`s keyed by `name`, written the first time a card is
 * fetched from Scryfall. A distinct table so the Cockatrice-XML-shaped
 * `cards` table stays single-source — see the note on
 * Stores.SCRYFALL_CACHE. Every read and write swallows Dexie failures: a
 * cache miss only costs a network request.
 */

export async function getFromScryfallCache(name: string): Promise<LookupResult | undefined> {
  try {
    const raw = (await dexieService.scryfallCache.get(name)) as
      | LookupResult
      | undefined;
    return raw ? sanitizeCached(raw) : undefined;
  } catch {
    return undefined;
  }
}

export async function bulkGetFromScryfallCache(
  names: string[],
): Promise<Array<LookupResult | undefined>> {
  try {
    const raw = (await dexieService.scryfallCache.bulkGet(names)) as Array<
      LookupResult | undefined
    >;
    return raw.map((r) => (r ? sanitizeCached(r) : undefined));
  } catch {
    return names.map(() => undefined);
  }
}

/**
 * Drop stale `combo_piece` entries from a cached Scryfall record.
 * We used to write those into the cache, but they turned out to be
 * unreliable (see the `scryfallToLookup` comment). Filtering on
 * read lets old cached records self-heal without a schema bump —
 * the next time we re-fetch and write, the record will already be
 * clean. Cheap enough to run every read.
 */
function sanitizeCached(result: LookupResult): LookupResult {
  if (!result.related) {
    return result;
  }
  const filtered = result.related.filter((r) => r.component !== 'combo_piece');
  if (filtered.length === result.related.length) {
    return result;
  }
  return { ...result, related: filtered.length > 0 ? filtered : undefined };
}

export async function putScryfallCache(result: LookupResult): Promise<void> {
  try {
    // Dexie's put replaces the whole record — safe for our use since
    // we always store the full merged LookupResult (not partial
    // patches). Failures are swallowed so a full-disk / permissions
    // error doesn't break the caller.
    await dexieService.scryfallCache.put(result);
  } catch {
    /* ignore */
  }
}

export async function bulkPutScryfallCache(results: LookupResult[]): Promise<void> {
  if (results.length === 0) {
    return;
  }
  try {
    await dexieService.scryfallCache.bulkPut(results);
  } catch {
    /* ignore */
  }
}
