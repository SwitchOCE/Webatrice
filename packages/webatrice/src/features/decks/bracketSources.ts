import type { DeckCard } from './types';

/**
 * Third-party data behind the bracket assessment, behind one adapter:
 *   • Scryfall — the Game Changers list (`is:gamechanger`) and oracle text
 *     for every deck card (`/cards/collection`);
 *   • Commander Spellbook — `POST /find-my-combos/` with the deck's card
 *     names and quantities (nothing else about the deck is sent).
 *
 * Every call has a timeout and returns a `SourceResult`, so an outage,
 * an HTTP error or a malformed body is reported as such instead of
 * looking like valid empty data. Only complete responses are cached.
 */

export type BracketSource = 'gameChangers' | 'oracleText' | 'combos';

/** Why a source couldn't answer. */
export type SourceFailure =
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'http'; status: number }
  | { kind: 'malformed' };

export type SourceResult<T> =
  | { status: 'ok'; data: T }
  /** Some requests failed; `data` holds what arrived, `missing` of `total` items did not. */
  | { status: 'partial'; data: T; failure: SourceFailure; missing: number; total: number }
  | { status: 'unavailable'; failure: SourceFailure };

export const BRACKET_SOURCE_TIMEOUT_MS = 15_000;

const GAME_CHANGERS_URL = 'https://api.scryfall.com/cards/search?q=is%3Agamechanger&order=name&unique=cards';
const COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const SPELLBOOK_URL = 'https://backend.commanderspellbook.com/find-my-combos/';
const COLLECTION_CHUNK = 75;

const MALFORMED: SourceFailure = { kind: 'malformed' };

class SourceError extends Error {
  constructor(readonly failure: SourceFailure) {
    super(failure.kind);
  }
}

/** `fetch` + JSON with a timeout; any failure throws a `SourceError`. */
async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRACKET_SOURCE_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (e) {
      throw new SourceError({ kind: (e as { name?: string })?.name === 'AbortError' ? 'timeout' : 'network' });
    }
    if (!res.ok) {
      throw new SourceError({ kind: 'http', status: res.status });
    }
    try {
      return await res.json();
    } catch {
      throw new SourceError(MALFORMED);
    }
  } finally {
    clearTimeout(timer);
  }
}

function failureOf(e: unknown): SourceFailure {
  return e instanceof SourceError ? e.failure : { kind: 'network' };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// ---------- Scryfall: Game Changers list ----------

let gameChangersCache: Set<string> | null = null;
let gameChangersInFlight: Promise<SourceResult<Set<string>>> | null = null;

/** WotC's Game Changers list, by card name. Cached for the session once fetched. */
export async function fetchGameChangers(): Promise<SourceResult<Set<string>>> {
  if (gameChangersCache) {
    return { status: 'ok', data: gameChangersCache };
  }
  if (gameChangersInFlight) {
    return gameChangersInFlight;
  }
  gameChangersInFlight = (async (): Promise<SourceResult<Set<string>>> => {
    try {
      const body = await fetchJson(GAME_CHANGERS_URL);
      if (!isRecord(body) || !Array.isArray(body.data)) {
        return { status: 'unavailable', failure: MALFORMED };
      }
      const names = new Set<string>();
      for (const c of body.data as Array<{ name?: unknown }>) {
        if (typeof c?.name === 'string') {
          names.add(c.name);
        }
      }
      gameChangersCache = names;
      return { status: 'ok', data: names };
    } catch (e) {
      return { status: 'unavailable', failure: failureOf(e) };
    } finally {
      gameChangersInFlight = null;
    }
  })();
  return gameChangersInFlight;
}

// ---------- Scryfall: oracle text ----------

interface ScryfallCollectionCard {
  name: string;
  oracle_text?: string;
  card_faces?: Array<{ oracle_text?: string }>;
}

// Session cache keyed by lower-cased name. A name Scryfall answered
// without a match caches as '' (it genuinely has no oracle text); a name
// whose request failed is not cached, so a retry asks again.
const oracleCache = new Map<string, string>();
const oracleInFlight = new Map<string, Promise<SourceFailure | null>>();

/**
 * Oracle text for `names`, keyed by lower-cased name, via Scryfall's
 * collection endpoint (75 identifiers per request). `partial` when some
 * requests failed — their names are absent from the map.
 */
export async function fetchOracleText(names: string[]): Promise<SourceResult<Map<string, string>>> {
  const uniqueLower = Array.from(new Set(names.map((n) => n.toLowerCase())));
  // Scryfall gets the caller's original casing.
  const originalByLower = new Map<string, string>();
  for (const n of names) {
    originalByLower.set(n.toLowerCase(), n);
  }

  const need: string[] = [];
  const awaiting: Array<Promise<SourceFailure | null>> = [];
  for (const key of uniqueLower) {
    if (oracleCache.has(key)) {
      continue;
    }
    const pending = oracleInFlight.get(key);
    if (pending) {
      awaiting.push(pending);
    } else {
      need.push(key);
    }
  }

  const failures: SourceFailure[] = [];
  for (let i = 0; i < need.length; i += COLLECTION_CHUNK) {
    const chunk = need.slice(i, i + COLLECTION_CHUNK);
    const request = fetchOracleChunk(chunk, originalByLower);
    for (const k of chunk) {
      oracleInFlight.set(k, request);
    }
    try {
      const failure = await request;
      if (failure) {
        failures.push(failure);
      }
    } finally {
      for (const k of chunk) {
        oracleInFlight.delete(k);
      }
    }
  }
  for (const failure of await Promise.all(awaiting)) {
    if (failure) {
      failures.push(failure);
    }
  }

  const data = new Map<string, string>();
  for (const key of uniqueLower) {
    const text = oracleCache.get(key);
    if (text != null) {
      data.set(key, text);
    }
  }
  if (failures.length === 0) {
    return { status: 'ok', data };
  }
  if (data.size === 0) {
    return { status: 'unavailable', failure: failures[0] };
  }
  return {
    status: 'partial',
    data,
    failure: failures[0],
    missing: uniqueLower.length - data.size,
    total: uniqueLower.length,
  };
}

/** Fetch and cache one chunk; resolves to its failure, or `null` on success. */
async function fetchOracleChunk(
  chunk: string[],
  originalByLower: Map<string, string>,
): Promise<SourceFailure | null> {
  try {
    const body = await fetchJson(COLLECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map((k) => ({ name: originalByLower.get(k) ?? k })) }),
    });
    if (!isRecord(body) || !Array.isArray(body.data)) {
      return MALFORMED;
    }
    const returned = new Set<string>();
    for (const card of body.data as ScryfallCollectionCard[]) {
      const combined =
        card.oracle_text ??
        (card.card_faces ?? []).map((f) => f.oracle_text ?? '').filter(Boolean).join('\n');
      const key = card.name.toLowerCase();
      oracleCache.set(key, combined);
      returned.add(key);
      // Split cards come back as "A // B"; also key the front face so a
      // caller that asked for that name alone still hits.
      const firstFace = key.split(' // ')[0];
      if (firstFace !== key) {
        oracleCache.set(firstFace, combined);
        returned.add(firstFace);
      }
    }
    // Answered without a match: there is no oracle text to find.
    for (const k of chunk) {
      if (!returned.has(k)) {
        oracleCache.set(k, '');
      }
    }
    return null;
  } catch (e) {
    return failureOf(e);
  }
}

// ---------- Commander Spellbook: combos ----------

/** A combo from find-my-combos. The API calls the deck's cards `uses`;
 *  every array is optional because legacy combos omit fields. */
export interface SpellbookCombo {
  id: string;
  uses?: Array<{
    card: { name: string };
    quantity?: number;
    zoneLocations?: string[];
  }>;
  produces?: Array<{ feature?: { id: number }; quantity?: number }>;
  requires?: Array<{
    template?: { id: number };
    quantity?: number;
    zoneLocations?: string[];
  }>;
  manaValueNeeded?: number;
  notablePrerequisites?: string;
}

/**
 * Every Spellbook combo fully present in the deck. Sends only card names
 * and quantities, merged across main and sideboard (Spellbook ignores
 * zones for detection).
 */
export async function fetchSpellbookCombos(cards: DeckCard[]): Promise<SourceResult<SpellbookCombo[]>> {
  const merged = new Map<string, number>();
  for (const c of cards) {
    merged.set(c.name, (merged.get(c.name) ?? 0) + c.quantity);
  }
  const main = Array.from(merged, ([card, quantity]) => ({ card, quantity }));
  try {
    const body = await fetchJson(SPELLBOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ main }),
    });
    if (!isRecord(body) || !isRecord(body.results)) {
      return { status: 'unavailable', failure: MALFORMED };
    }
    const included = body.results.included ?? [];
    if (!Array.isArray(included)) {
      return { status: 'unavailable', failure: MALFORMED };
    }
    return { status: 'ok', data: included as SpellbookCombo[] };
  } catch (e) {
    return { status: 'unavailable', failure: failureOf(e) };
  }
}

/** Forget every cached response (tests; a future "refresh data" action). */
export function clearBracketSourceCaches(): void {
  gameChangersCache = null;
  gameChangersInFlight = null;
  oracleCache.clear();
  oracleInFlight.clear();
}
