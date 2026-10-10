import { useEffect, useState } from 'react';

import { searchScryfallCards, ScryfallSearchError, type ScryfallSearchCard, type ScryfallSearchFailure } from '../search';

export const SEARCH_DEBOUNCE_MS = 300;

export interface ScryfallCardSearch {
  results: ScryfallSearchCard[];
  loading: boolean;
  error: ScryfallSearchFailure | null;
}

export function useScryfallCardSearch(query: string): ScryfallCardSearch {
  const [results, setResults] = useState<ScryfallSearchCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ScryfallSearchFailure | null>(null);

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
        if (!controller.signal.aborted) {
          setResults(cards);
        }
      } catch (e) {
        if (controller.signal.aborted || (e as { name?: string })?.name === 'AbortError') {
          return;
        }
        setError(e instanceof ScryfallSearchError ? e.failure : { kind: 'failed' });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return { results, loading, error };
}
