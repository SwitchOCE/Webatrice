import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useQuickAddSuggestions } from '../../hooks/useQuickAddSuggestions';

export interface QuickAddSearchProps {
  /** Controlled query state — lifted to the parent so the Advanced
   *  search button can take it over on switch (see DeckMainPane). */
  query: string;
  onQueryChange: (query: string) => void;
  onAdd: (name: string) => void;
  /** The combobox input, for a parent that hands focus to it. */
  inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Card-name autocomplete for the MTG toolbar, as an ARIA 1.2 combobox: the
 * input keeps focus while ↑/↓ move the highlighted option (announced through
 * `aria-activedescendant`), Enter adds it (or, with the list closed, the
 * typed name), and Escape closes the popup, then clears the field. A polite status reports searching,
 * the number of suggestions and no matches.
 */
export function QuickAddSearch({ query, onQueryChange, onAdd, inputRef: externalInputRef }: QuickAddSearchProps) {
  const { t } = useTranslation();
  const setQuery = onQueryChange;
  const { suggestions, loading, highlight, setHighlight, clear } = useQuickAddSuggestions(query);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ownInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? ownInputRef;
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const searching = open && query.trim().length >= 2;
  const expanded = searching && !loading && suggestions.length > 0;
  const activeOption = expanded && highlight >= 0 && highlight < suggestions.length ? optionId(highlight) : undefined;
  const status = !searching
    ? ''
    : loading
      ? t('DeckEditor.quickAdd.searching')
      : suggestions.length === 0
        ? t('DeckEditor.quickAdd.noMatches')
        : t('DeckEditor.quickAdd.suggestions', { count: suggestions.length });

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
      // Only an option the combobox announces counts: with the list closed,
      // Enter adds what was typed, not a suggestion the user can't see.
      if (activeOption) {
        handleAdd(suggestions[highlight].name);
      } else if (query.trim()) {
        handleAdd(query.trim());
      }
    } else if (e.key === 'Escape') {
      // APG combobox: the first Escape closes the popup (list, searching or
      // no matches) and drops the highlight, the next clears the field.
      if (searching) {
        setOpen(false);
        setHighlight(-1);
      } else {
        setQuery('');
      }
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
          role="combobox"
          aria-label={t('DeckEditor.quickAdd.label')}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listboxId : undefined}
          aria-activedescendant={activeOption}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('DeckEditor.quickAdd.placeholder')}
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
            aria-label={t('DeckEditor.quickAdd.clear')}
          >
            <X size={12} />
          </button>
        )}
      </label>

      <p role="status" className="sr-only">{status}</p>

      {searching && (
        <div
          className={[
            'absolute right-0 left-0 top-full mt-1 z-20 rounded-md',
            'bg-bg-surface border border-border-subtle shadow-glow overflow-hidden',
          ].join(' ')}
        >
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
              <Loader2 size={11} className="animate-spin" /> {t('DeckEditor.quickAdd.searching')}
            </div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted italic">{t('DeckEditor.quickAdd.noMatches')}</div>
          )}
          {expanded && (
            <ul id={listboxId} role="listbox" aria-label={t('DeckEditor.quickAdd.listLabel')}>
              {suggestions.map((s, i) => (
                <li
                  key={s.name}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  // Keep focus in the input, which owns the combobox.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleAdd(s.name)}
                  className={[
                    'px-3 py-1.5 text-sm text-text-primary truncate cursor-pointer transition-colors',
                    i === highlight ? 'bg-bg-elevated' : 'hover:bg-bg-elevated',
                  ].join(' ')}
                >
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
