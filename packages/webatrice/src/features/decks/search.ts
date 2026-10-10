
import { rethrowCancellationOrRateLimit, scheduleScryfallRequest } from '../../services/scryfall/scheduler';
import type { DeckCard } from './types';

export interface SearchResult {
  name: string;
  source: 'scryfall';
}

const MIN_QUERY = 2;

export async function searchCards(query: string, limit = 20, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) {
    return [];
  }

  const url = `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`;
  try {
    const res = await scheduleScryfallRequest(url, signal ? { signal } : undefined);
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as { data?: string[] };
    return (body.data ?? []).slice(0, limit).map((name) => ({ name, source: 'scryfall' }));
  } catch (error) {
    rethrowCancellationOrRateLimit(error);
    return [];
  }
}

/**
 * Rich Scryfall card shape used by the advanced-search results grid.
 * Superset of what the printings picker needs — we surface image_uris,
 * type_line, mana_cost, set, and collector so the tile can render a
 * card image with proper labels without a second fetch.
 */
export interface ScryfallSearchCard {
  id: string;
  name: string;
  mana_cost?: string;
  type_line?: string;
  set?: string;
  collector_number?: string;
  image_uris?: { small?: string; normal?: string; large?: string };
  card_faces?: Array<{ image_uris?: { small?: string; normal?: string } }>;
}

export type ScryfallSearchFailure = { kind: 'failed' } | { kind: 'badQuery'; details: string };

export class ScryfallSearchError extends Error {
  constructor(readonly failure: ScryfallSearchFailure) {
    super();
    this.name = 'ScryfallSearchError';
  }
}

/**
 * Full-fat Scryfall search (as opposed to `/cards/autocomplete` used by
 * QuickAdd). Accepts Scryfall's full query syntax so filter clauses
 * like `c:wu`, `t:creature`, `cmc<=3`, `o:"draw a card"` all compose
 * into the same request. Aborts cleanly via AbortController so the
 * caller can cancel in-flight requests when the user keeps typing.
 */
export async function searchScryfallCards(
  query: string,
  signal?: AbortSignal,
): Promise<ScryfallSearchCard[]> {
  const q = query.trim();
  if (!q) {
    return [];
  }
  // `unique=cards` collapses printings so each card appears once, which
  // matches how the printings picker layers on top of a search result.
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=name`;
  try {
    const res = await scheduleScryfallRequest(url, { signal });
    if (!res.ok) {
      if (res.status === 404 || res.status === 400) {
        const body = await res.json() as { object?: string; code?: string; details?: string } | null;
        if (res.status === 404 && body?.object === 'error' && body.code === 'not_found') {
          return [];
        }
        if (res.status === 400 && body?.object === 'error' && body.code === 'bad_request'
          && typeof body.details === 'string') {
          throw new ScryfallSearchError({ kind: 'badQuery', details: body.details });
        }
      }
      throw new ScryfallSearchError({ kind: 'failed' });
    }
    const body = (await res.json()) as { data?: ScryfallSearchCard[] };
    return body.data ?? [];
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') {
      throw e;
    }
    if (e instanceof ScryfallSearchError) {
      throw e;
    }
    throw new ScryfallSearchError({ kind: 'failed' });
  }
}

export function searchCardImage(card: ScryfallSearchCard): string | undefined {
  return (
    card.image_uris?.normal ??
    card.image_uris?.small ??
    card.card_faces?.[0]?.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.small
  );
}

export function searchCardAsPreview(card: ScryfallSearchCard): DeckCard {
  return {
    name: card.name,
    quantity: 1,
    category: 'main',
    typeLine: card.type_line,
    manaCost: card.mana_cost,
    set: card.set,
    collectorNumber: card.collector_number,
    scryfallId: card.id,
    imageUri: searchCardImage(card),
    lookupSource: 'scryfall',
  };
}
