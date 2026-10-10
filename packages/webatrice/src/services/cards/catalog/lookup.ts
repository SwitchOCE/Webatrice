import { currentCardDataPreferences, type CardDataPreferences } from '../../cardDatabase';
import { fetchCollection, fetchNamedCard, fetchPrintings, SCRYFALL_NAMED_RETRY_CAP } from '../../scryfall/client';
import { bulkGetFromDexie, dexieToLookup, getFromDexie } from './dexieCardMapper';
import {
  bulkGetFromScryfallCache,
  bulkPutScryfallCache,
  getFromScryfallCache,
  putScryfallCache,
} from './scryfallCache';
import { scryfallToLookup } from './scryfallCardMapper';
import type { LookupHint, LookupInput, LookupResult, PrintingSummary, RelatedCardRef } from './types';

/**
 * Look up a single card by name. Merges Dexie cards.xml data (if we
 * have the card) with Scryfall data (from persistent cache, else
 * network fetch). Falls back to `{ found: false, source: 'unknown',
 * ... }` if neither source knows the card. Names should be exact
 * (case-insensitive match handled internally by Dexie's primary key
 * / Scryfall's exact endpoint).
 */
export async function lookupCard(name: string): Promise<LookupResult> {
  const [xmlHit, scryfallCached, preferences] = await Promise.all([
    getFromDexie(name),
    getFromScryfallCache(name),
    readCardDataPreferences(),
  ]);
  const xmlLookup = xmlHit ? dexieToLookup(xmlHit, preferences) : undefined;

  let scryfallLookup = scryfallCached;
  if (!scryfallLookup) {
    const fetched = await fetchNamedCard(name);
    if (fetched) {
      scryfallLookup = scryfallToLookup(fetched);
      // Write-through to the persistent cache. Fire-and-forget —
      // a stalled Dexie write shouldn't hold up the caller.
      void putScryfallCache(scryfallLookup);
    }
  }

  return mergeLookup(name, xmlLookup, scryfallLookup);
}

/**
 * Session-scoped memo for `lookupCards`. Cleared on page reload but
 * survives every dialog open in between. Keyed by exact input name.
 * Only successful lookups (source !== 'unknown') are stored so a
 * transient network failure doesn't stick.
 *
 * Motivation: even with the persistent Dexie scryfallCache, checking
 * Dexie once per repeated call still costs an IndexedDB roundtrip.
 * In-memory cache is O(1) for the hot repeat-lookup case (multiple
 * dialogs opened in a session referencing the same names).
 */
const sessionCache = new Map<string, LookupResult>();

let sessionCachePreferences: CardDataPreferences | undefined;

async function readCardDataPreferences(): Promise<CardDataPreferences | undefined> {
  try {
    const preferences = await currentCardDataPreferences();
    if (preferences !== sessionCachePreferences) {
      sessionCache.clear();
      sessionCachePreferences = preferences;
    }
    return preferences;
  } catch {
    return undefined;
  }
}

export async function lookupCardsCached(names: string[]): Promise<Map<string, LookupResult>> {
  const out = new Map<string, LookupResult>();
  const missing: string[] = [];
  await readCardDataPreferences();
  for (const name of names) {
    const cached = sessionCache.get(name);
    if (cached) {
      out.set(name, cached);
    } else {
      missing.push(name);
    }
  }
  if (missing.length === 0) {
    return out;
  }
  const fresh = await lookupCards(missing);
  for (const [name, result] of fresh) {
    out.set(name, result);
    if (result.source !== 'unknown') {
      sessionCache.set(name, result);
    }
  }
  return out;
}

/**
 * Batch version: parallel Dexie `bulkGet` on both tables, then
 * Scryfall `/cards/collection` (POST, 75 identifiers per request)
 * for any name we don't already have Scryfall data for. Returns a
 * Map keyed by input name for O(1) lookups by the caller.
 *
 * The batched Scryfall path is what makes hydrating an imported .cod
 * on a fresh Dexie DB take 1–2 network round-trips instead of one per
 * card. `/cards/named?exact=` (used by the single-card `lookupCard`)
 * is intentionally reserved for the one-off "add card by name" flow
 * where the caller has exactly one name.
 */
export async function lookupCards(
  input: LookupInput[],
): Promise<Map<string, LookupResult>> {
  const out = new Map<string, LookupResult>();
  // Normalize to `LookupHint`, deduped by name (first hint wins if a
  // caller passes the same name twice with conflicting printing
  // hints — arbitrary but stable). Returned Map is keyed by name so
  // callers can still `.get(name)` regardless of whether they passed
  // strings or hints.
  const uniqueHints = new Map<string, LookupHint>();
  for (const item of input) {
    const hint = typeof item === 'string' ? { name: item } : item;
    if (hint.name && !uniqueHints.has(hint.name)) {
      uniqueHints.set(hint.name, hint);
    }
  }
  if (uniqueHints.size === 0) {
    return out;
  }

  const uniqueNames = Array.from(uniqueHints.keys());

  const [xmlHits, scryfallCached, preferences] = await Promise.all([
    bulkGetFromDexie(uniqueNames),
    bulkGetFromScryfallCache(uniqueNames),
    readCardDataPreferences(),
  ]);

  // Names we still need to fetch from Scryfall. Any name without a
  // scryfallCache hit — regardless of whether cards.xml has it —
  // because we want Scryfall's `all_parts` list for the related-
  // tokens menu.
  const scryfallLookups = new Map<string, LookupResult>();
  for (let i = 0; i < uniqueNames.length; i++) {
    const cached = scryfallCached[i];
    if (cached) {
      scryfallLookups.set(uniqueNames[i], cached);
    }
  }

  const needScryfall: LookupHint[] = [];
  for (const name of uniqueNames) {
    if (!scryfallLookups.has(name)) {
      needScryfall.push(uniqueHints.get(name)!);
    }
  }

  if (needScryfall.length > 0) {
    const collected = await fetchCollection(needScryfall);
    const toCache: LookupResult[] = [];
    for (const hint of needScryfall) {
      const hit = collected.get(hint.name);
      if (hit) {
        const parsed = scryfallToLookup(hit);
        scryfallLookups.set(hint.name, parsed);
        toCache.push(parsed);
      }
    }
    // Retry batch misses individually via `/cards/named?exact=`. The
    // batch `/cards/collection` endpoint silently drops names it can't
    // resolve (e.g. odd Unicode variants, network partial failures),
    // which for zone-view flows like an opponent's revealed library
    // would leave most cards with `typeLine=null` and bucket every
    // creature under "Other" in the group-by-type view. The individual
    // endpoint has more permissive matching so a second pass usually
    // recovers what the batch missed. Capped at 50 to avoid a
    // self-inflicted DoS when the batch endpoint fails wholesale —
    // 700 concurrent /cards/named calls would blow past Scryfall's
    // recommended rate limit and be actively slower than a single
    // clean batch failure. If more than 50 names are unresolved, the
    // batch is broken for reasons individual calls won't fix and we
    // give up gracefully; the console.warn on the batch failure is
    // the actionable signal.
    const stillMissing = needScryfall.filter(
      (h) => !scryfallLookups.has(h.name),
    );
    if (stillMissing.length > 0 && stillMissing.length <= SCRYFALL_NAMED_RETRY_CAP) {
      const retried = await Promise.all(
        stillMissing.map((h) => fetchNamedCard(h.name)),
      );
      for (let i = 0; i < stillMissing.length; i++) {
        const hit = retried[i];
        if (hit) {
          const parsed = scryfallToLookup(hit);
          scryfallLookups.set(stillMissing[i].name, parsed);
          toCache.push(parsed);
        }
      }
    } else if (stillMissing.length > SCRYFALL_NAMED_RETRY_CAP) {
      console.warn(
        `Skipping per-name Scryfall retry: ${stillMissing.length} names unresolved (over ${SCRYFALL_NAMED_RETRY_CAP}-name cap).`
        + ' Batch endpoint likely failed wholesale; individual retries would exceed Scryfall rate limits.',
      );
    }
    if (toCache.length > 0) {
      // Fire-and-forget. Cache misses on write don't affect the
      // return value — we've already got the parsed data in-hand.
      void bulkPutScryfallCache(toCache);
    }
  }

  for (let i = 0; i < uniqueNames.length; i++) {
    const key = uniqueNames[i];
    const xmlLookup = xmlHits[i] ? dexieToLookup(xmlHits[i]!, preferences) : undefined;
    const scryfallLookup = scryfallLookups.get(key);
    out.set(key, mergeLookup(key, xmlLookup, scryfallLookup));
  }

  return out;
}

/**
 * Return every Scryfall printing for `name` (exact match), sorted
 * newest-first. Used by the printings picker — Dexie only knows the
 * printings that were in the user's imported Cockatrice XML, which
 * for many cards is a single entry. Scryfall has the full history.
 *
 * Empty array on network error / 404 (Scryfall returns 404 for "no
 * matches") so the caller can degrade to `lookupCard(name).printings`
 * without a try/catch.
 */
export async function fetchAllPrintings(name: string): Promise<PrintingSummary[]> {
  const cards = await fetchPrintings(name);
  try {
    return cards.map((c) => ({
      set: c.set,
      collectorNumber: c.collector_number,
      scryfallId: c.id,
      imageUri:
        c.image_uris?.normal ??
        c.image_uris?.small ??
        c.card_faces?.[0]?.image_uris?.normal ??
        c.card_faces?.[0]?.image_uris?.small,
    }));
  } catch {
    return [];
  }
}

// ---------- Merge ----------

/**
 * Merge Dexie cards.xml data with Scryfall data (persistent cache or
 * fresh fetch). Rules:
 *   - Base fields (typeLine, PT, manaCost, colors, cmc) prefer the
 *     XML shape — cards.xml is the user's canonical import and stays
 *     consistent with their card corpus.
 *   - `related` prefers Scryfall (only Scryfall's `all_parts` gives
 *     us the token's scryfallId for image fetches), with cards.xml
 *     count/persistent modifiers overlaid by name match.
 *   - printings prefers XML (has the user's mirror URLs); if only
 *     Scryfall is available, uses Scryfall's single printing.
 */
function mergeLookup(
  name: string,
  xml: LookupResult | undefined,
  scryfall: LookupResult | undefined,
): LookupResult {
  if (!xml && !scryfall) {
    return { found: false, source: 'unknown', name, printings: [] };
  }
  if (xml && !scryfall) {
    return xml;
  }
  if (!xml && scryfall) {
    return scryfall;
  }
  // Both present. Base = XML; overlay Scryfall for related list.
  const xmlRelated = xml!.related ?? [];
  const scryfallRelated = scryfall!.related ?? [];
  // Overlay: for each Scryfall entry, if cards.xml has a matching
  // name, promote its count/persistent onto the Scryfall entry.
  const xmlByName = new Map(xmlRelated.map((r) => [r.name, r]));
  const overlaid: RelatedCardRef[] = scryfallRelated.map((s) => {
    const x = xmlByName.get(s.name);
    return x
      ? { ...s, count: x.count ?? s.count, persistent: x.persistent ?? s.persistent, attach: x.attach ?? s.attach, exclude: x.exclude }
      : s;
  });
  // Any cards.xml relations Scryfall didn't surface (rare — usually
  // a cards.xml `<related>` for a card missing from Scryfall's
  // dataset) still make it in.
  const seenNames = new Set(overlaid.map((r) => r.name));
  for (const x of xmlRelated) {
    if (!seenNames.has(x.name)) {
      overlaid.push(x);
    }
  }
  return {
    ...xml!,
    source: 'dexie+scryfall',
    related: overlaid.length > 0 ? overlaid : undefined,
    // Layout + faces only live on Scryfall records (cards.xml
    // doesn't carry them), so pull directly from that side without
    // any merging logic. Powers the "Transform into …" menu item.
    layout: scryfall!.layout,
    faces: scryfall!.faces,
    text: xml!.text ?? scryfall!.text,
    landscape: xml!.landscape || scryfall!.landscape,
    legalities: xml!.legalities ?? scryfall!.legalities,
  };
}
