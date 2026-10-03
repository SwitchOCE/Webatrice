import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';

import { useQuickAddSuggestions } from '../../hooks/useQuickAddSuggestions';

export interface QuickAddSearchProps {
  /** Controlled query state — lifted to the parent so the Advanced
   *  search button can take it over on switch (see DeckMainPane). */
  query: string;
  onQueryChange: (query: string) => void;
  onAdd: (name: string) => void;
}

export function QuickAddSearch({ query, onQueryChange, onAdd }: QuickAddSearchProps) {
  const setQuery = onQueryChange;
  const { suggestions, loading, highlight, setHighlight, clear } = useQuickAddSuggestions(query);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleAdd = (name: string) => {
    if (!name) {
      return;
    }
    onAdd(name);
    setQuery('');
    clear();
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (suggestions.length ? (h + 1) % suggestions.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (suggestions.length ? (h - 1 + suggestions.length) % suggestions.length : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && suggestions[highlight]) {
        handleAdd(suggestions[highlight].name);
      } else if (query.trim()) {
        // No suggestion highlighted — try the exact query as a name.
        handleAdd(query.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    // Width + surface color match fancy webatrice's QuickAddSearch:
    // `w-72` (288px) and `bg-bg-base` (deeper than the toolbar itself,
    // so the input reads as recessed rather than raised).
    <div ref={rootRef} className="relative w-72">
      <label className="relative block">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Quick add — type a card name"
          className={[
            'w-full pl-8 pr-8 py-1.5 rounded-md bg-bg-base border',
            'border-border-subtle text-xs text-text-primary',
            'placeholder:text-text-muted focus:outline-none',
            'focus:ring-1 focus:border-accent focus:ring-accent transition-colors',
          ].join(' ')}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text-primary transition-colors"
            aria-label="Clear"
          >
            <X size={12} />
          </button>
        )}
      </label>

      {open && query.trim().length >= 2 && (
        <div
          className={[
            'absolute right-0 left-0 top-full mt-1 z-20 rounded-md',
            'bg-bg-surface border border-border-subtle shadow-glow overflow-hidden',
          ].join(' ')}
        >
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
              <Loader2 size={11} className="animate-spin" /> Searching…
            </div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted italic">No matches</div>
          )}
          {!loading &&
            suggestions.map((s, i) => {
              return (
                <button
                  key={s.name}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => handleAdd(s.name)}
                  className={[
                    'w-full block px-3 py-1.5 text-left text-sm text-text-primary truncate transition-colors',
                    i === highlight ? 'bg-bg-elevated' : 'hover:bg-bg-elevated',
                  ].join(' ')}
                >
                  {s.name}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
