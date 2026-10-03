import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { searchCards, type SearchResult } from '../search';

export const SUGGESTION_DEBOUNCE_MS = 220;
export const MAX_SUGGESTIONS = 8;

export interface QuickAddSuggestions {
  suggestions: SearchResult[];
  loading: boolean;
  /** Keyboard-highlighted suggestion; the first one when results land, -1 for none. */
  highlight: number;
  setHighlight: Dispatch<SetStateAction<number>>;
  /** Drop the current suggestions (after one was added). */
  clear: () => void;
}

/**
 * Debounced card-name autocomplete for quick add. Queries shorter than
 * two characters clear the list; a response that arrives after a newer
 * query was sent is discarded.
 */
export function useQuickAddSuggestions(query: string): QuickAddSuggestions {
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const timerRef = useRef<number | null>(null);
  const queryTokenRef = useRef(0);

  useEffect(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    if (query.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      setHighlight(-1);
      return;
    }
    setLoading(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const token = ++queryTokenRef.current;
      searchCards(query, MAX_SUGGESTIONS)
        .then((rows) => {
          if (token !== queryTokenRef.current) {
            return;
          }
          setSuggestions(rows);
          setLoading(false);
          setHighlight(rows.length ? 0 : -1);
        })
        .catch(() => {
          if (token !== queryTokenRef.current) {
            return;
          }
          setSuggestions([]);
          setLoading(false);
          setHighlight(-1);
        });
    }, SUGGESTION_DEBOUNCE_MS);
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [query]);

  const clear = () => {
    setSuggestions([]);
    setHighlight(-1);
  };

  return { suggestions, loading, highlight, setHighlight, clear };
}
