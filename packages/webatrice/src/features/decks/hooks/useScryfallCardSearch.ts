import { useEffect, useState } from 'react';

import { searchScryfallCards, type ScryfallSearchCard } from '../search';

export const SEARCH_DEBOUNCE_MS = 300;

export interface ScryfallCardSearch {
  results: ScryfallSearchCard[];
  loading: boolean;
  error: string | null;
}

/**
 * Debounced Scryfall search for a composed query. A newer query aborts
 * the in-flight request so stale results never paint; an empty query
 * clears the results.
 */
export function useScryfallCardSearch(query: string): ScryfallCardSearch {
  const [results, setResults] = useState<ScryfallSearchCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const t = window.setTimeout(async () => {
      try {
        const cards = await searchScryfallCards(q, controller.signal);
        setResults(cards);
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') {
          return;
        }
        setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return { results, loading, error };
}
