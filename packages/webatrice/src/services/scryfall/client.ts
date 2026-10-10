import type { ScryfallCard, ScryfallCardHint, ScryfallIdentifier } from './types';

export const SCRYFALL_API = 'https://api.scryfall.com';

export const SCRYFALL_COLLECTION_URL = `${SCRYFALL_API}/cards/collection`;

export const SCRYFALL_COLLECTION_LIMIT = 75;

export const SCRYFALL_NAMED_RETRY_CAP = 50;

const TOKEN_SUFFIX_RE = /\s*\(?\bToken\b\)?\s*$/i;

export function cleanScryfallName(name: string): string {
  return name.replace(TOKEN_SUFFIX_RE, '');
}

export function chunkForCollection<T>(items: readonly T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += SCRYFALL_COLLECTION_LIMIT) {
    chunks.push(items.slice(i, i + SCRYFALL_COLLECTION_LIMIT));
  }
  return chunks;
}

export function scryfallCardUrl(scryfallId: string): string {
  return `${SCRYFALL_API}/cards/${encodeURIComponent(scryfallId)}`;
}

export function scryfallNamedUrl(exactName: string): string {
  return `${SCRYFALL_API}/cards/named?exact=${encodeURIComponent(exactName)}`;
}

export function scryfallSearchUrl(q: string, params: string): string {
  return `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(q)}&${params}`;
}

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
