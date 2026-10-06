import type { ScryfallCard, ScryfallCardHint, ScryfallIdentifier } from './types';

/**
 * The one Scryfall HTTP client: endpoint URLs, the `/cards/collection`
 * batch limit and the request shapes every caller sends. Callers keep
 * their own caching and error policy; this module only decides what
 * goes over the wire. Every Scryfall API request is built here except
 * the deck editor's autocomplete and card search
 * (`features/decks/search.ts`), which move onto the client in PR 31.
 *
 * Batching (75 identifiers per collection request) and capping per-name
 * fallbacks at `SCRYFALL_NAMED_RETRY_CAP` reduce request volume, but do
 * not enforce a request rate. This client does not throttle or queue
 * requests; a shared rate-limit scheduler remains future work.
 */

export const SCRYFALL_API = 'https://api.scryfall.com';

export const SCRYFALL_COLLECTION_URL = `${SCRYFALL_API}/cards/collection`;

/** Scryfall's maximum number of identifiers per `/cards/collection` request. */
export const SCRYFALL_COLLECTION_LIMIT = 75;

/** Most unresolved names worth retrying one exact-name request each. More
 *  than this means the batch failed wholesale, and that many single
 *  requests would exceed Scryfall's rate limit without fixing it. */
export const SCRYFALL_NAMED_RETRY_CAP = 50;

const TOKEN_SUFFIX_RE = /\s*\(?\bToken\b\)?\s*$/i;

/** Strip a trailing "(Token)" / "Token" suffix — those don't resolve on
 *  Scryfall's exact-match endpoints, which use the printed token name. */
export function cleanScryfallName(name: string): string {
  return name.replace(TOKEN_SUFFIX_RE, '');
}

/** `items` in `/cards/collection`-sized chunks, in order. */
export function chunkForCollection<T>(items: readonly T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += SCRYFALL_COLLECTION_LIMIT) {
    chunks.push(items.slice(i, i + SCRYFALL_COLLECTION_LIMIT));
  }
  return chunks;
}

/** A card's JSON record by Scryfall id. */
export function scryfallCardUrl(scryfallId: string): string {
  return `${SCRYFALL_API}/cards/${encodeURIComponent(scryfallId)}`;
}

/** A card's JSON record by exact name; the caller cleans the name. */
export function scryfallNamedUrl(exactName: string): string {
  return `${SCRYFALL_API}/cards/named?exact=${encodeURIComponent(exactName)}`;
}

/** A card search (`q` in Scryfall syntax) plus extra query parameters, already encoded. */
export function scryfallSearchUrl(q: string, params: string): string {
  return `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(q)}&${params}`;
}

/**
 * POST one `/cards/collection` request. At most
 * `SCRYFALL_COLLECTION_LIMIT` identifiers; chunk with
 * `chunkForCollection`. Resolves to the raw response so each caller
 * keeps its own reading of HTTP errors.
 */
export function postCollection(
  identifiers: readonly ScryfallIdentifier[],
  signal?: AbortSignal,
): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiers }),
  };
  if (signal) {
    init.signal = signal;
  }
  return fetch(SCRYFALL_COLLECTION_URL, init);
}

/**
 * One card by exact name, or `null` on a miss or any failure. The name is
 * NFC-normalised to match Scryfall's canonical storage, so an NFD-encoded
 * "Donnie's Bō" doesn't silently 404.
 */
export async function fetchNamedCard(name: string): Promise<ScryfallCard | null> {
  const url = scryfallNamedUrl(cleanScryfallName(name).normalize('NFC'));
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as ScryfallCard;
  } catch {
    return null;
  }
}

/**
 * Batch resolve `hints` through `/cards/collection`, every chunk at once.
 * Returns a Map keyed by the hint's ORIGINAL name (case-sensitive, as the
 * caller passed it); missing entries mean Scryfall couldn't resolve it.
 *
 * Identifier strategy — prefer `{set, collector_number}` when both are
 * present (deterministic — Moxfield / Archidekt exports carry them
 * explicitly, and it handles freshly-printed sets where Scryfall's
 * canonical `name` may not exactly match the export's spelling). Fall
 * back to `{name}` for hints without printing info.
 *
 * Name normalization — Scryfall stores canonical names in Unicode NFC.
 * Moxfield / other tools sometimes export NFD (`ō` decomposed into
 * `o + U+0304`), which fails a byte-comparison name match. NFC collapses
 * both forms to the same bytes. The "(Token)" suffix is stripped too.
 *
 * Result matching — each response card is matched back to the requesting
 * hint via set+collector when we sent that, else via NFC-normalized name.
 * Split cards also key by their first face for callers that asked by the
 * front-face name alone.
 */
export async function fetchCollection(hints: readonly ScryfallCardHint[]): Promise<Map<string, ScryfallCard>> {
  const out = new Map<string, ScryfallCard>();
  if (hints.length === 0) {
    return out;
  }

  await Promise.all(
    chunkForCollection(hints).map(async (chunk) => {
      try {
        const identifiers = chunk.map((h): ScryfallIdentifier => {
          if (h.set && h.collectorNumber) {
            return { set: h.set.toLowerCase(), collector_number: h.collectorNumber };
          }
          return { name: cleanScryfallName(h.name).normalize('NFC') };
        });
        const res = await postCollection(identifiers);
        if (!res.ok) {
          // Log so silent batch failures are diagnosable — otherwise
          // upstream sees "everything is Other" with no clue why.
          console.warn(
            `Scryfall /cards/collection returned ${res.status} for ${chunk.length} identifiers`,
          );
          return;
        }
        const body = (await res.json()) as { data?: ScryfallCard[] };
        // Index responses by both keying strategies so hint→card
        // matching below can look up whichever identifier we sent.
        const responseByName = new Map<string, ScryfallCard>();
        const responseBySetCol = new Map<string, ScryfallCard>();
        for (const card of body.data ?? []) {
          const nameKey = card.name.normalize('NFC').toLowerCase();
          responseByName.set(nameKey, card);
          // Split cards resolve as "A // B"; also key by the first
          // face so hints that asked by the front-face name alone hit.
          const firstFace = nameKey.split(' // ')[0];
          if (firstFace !== nameKey) {
            responseByName.set(firstFace, card);
          }
          if (card.set && card.collector_number) {
            responseBySetCol.set(`${card.set.toLowerCase()}|${card.collector_number}`, card);
          }
        }
        // Hints that sent set+collector check that map first; a miss
        // (Scryfall echoed a different set / promo variant than we asked
        // for) falls through to the name match.
        for (const h of chunk) {
          let hit: ScryfallCard | undefined;
          if (h.set && h.collectorNumber) {
            hit = responseBySetCol.get(`${h.set.toLowerCase()}|${h.collectorNumber}`);
          }
          if (!hit) {
            hit = responseByName.get(cleanScryfallName(h.name).normalize('NFC').toLowerCase());
          }
          if (hit) {
            out.set(h.name, hit);
          }
        }
      } catch {
        // Chunk failed — leave those cards missing.
      }
    }),
  );

  return out;
}

/**
 * Every printing of `name` (exact match), newest first; empty on a
 * network error or a 404 (Scryfall's "no matches").
 */
export async function fetchPrintings(name: string): Promise<ScryfallCard[]> {
  // `!"…"` is Scryfall syntax for exact-name match (unquoted phrases
  // fuzzy-match). `unique=prints` returns one row per printing rather
  // than the default `cards` dedupe.
  const q = `!"${cleanScryfallName(name).replace(/"/g, '\\"')}"`;
  try {
    const res = await fetch(scryfallSearchUrl(q, 'unique=prints&order=released&dir=desc'));
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as { data?: ScryfallCard[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}
