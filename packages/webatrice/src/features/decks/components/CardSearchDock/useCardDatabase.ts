import { useCallback, useEffect, useRef, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '../../hooks/useScryfallCardSearch';
import {
  ScryfallSearchError,
  scryfallSearchUrl,
  searchScryfallPage,
  type ScryfallSearchCard,
  type ScryfallSearchFailure,
} from '../../search';
import { isScryfallPageUrl } from './dockModel';

export interface CardDatabase {
  results: ScryfallSearchCard[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: ScryfallSearchFailure | null;
  hasMore: boolean;
  loadMore: () => void;
}

function failureOf(e: unknown): ScryfallSearchFailure {
  return e instanceof ScryfallSearchError ? e.failure : { kind: 'failed' };
}

function isAbort(e: unknown): boolean {
  return (e as { name?: string })?.name === 'AbortError';
}

export function useCardDatabase(query: string): CardDatabase {
  const [results, setResults] = useState<ScryfallSearchCard[]>([]);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ScryfallSearchFailure | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    setNextPage(null);
    setLoadingMore(false);
    if (!q) {
      setResults([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const page = await searchScryfallPage(scryfallSearchUrl(q), controller.signal);
        if (!controller.signal.aborted) {
          setResults(page.cards);
          setTotal(page.total);
          setNextPage(page.nextPage);
        }
      } catch (e) {
        if (controller.signal.aborted || isAbort(e)) {
          return;
        }
        setResults([]);
        setTotal(0);
        setError(failureOf(e));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const loadMore = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller || controller.signal.aborted || loadingMore || !isScryfallPageUrl(nextPage)) {
      return;
    }
    setLoadingMore(true);
    void searchScryfallPage(nextPage, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) {
          return;
        }
        setResults((prev) => [...prev, ...page.cards]);
        setNextPage(page.nextPage);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted && !isAbort(e)) {
          setError(failureOf(e));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingMore(false);
        }
      });
  }, [loadingMore, nextPage]);

  return { results, total, loading, loadingMore, error, hasMore: isScryfallPageUrl(nextPage), loadMore };
}
