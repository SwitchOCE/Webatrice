import { useEffect, useRef, useState, type RefObject } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useListboxCombobox } from '@app/hooks';

import { useQuickAddSuggestions } from '../../hooks/useQuickAddSuggestions';

export interface QuickAddSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  onAdd: (name: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

export function QuickAddSearch({ query, onQueryChange, onAdd, inputRef: externalInputRef }: QuickAddSearchProps) {
  const { t } = useTranslation();
  const setQuery = onQueryChange;
  const { suggestions, loading, highlight, setHighlight, clear } = useQuickAddSuggestions(query);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ownInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? ownInputRef;

  const searching = open && query.trim().length >= 2;
  const listed = searching && !loading;
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

  const { listboxId, inputProps, getOptionProps } = useListboxCombobox({
    count: suggestions.length,
    open: listed,
    highlight,
    onHighlightChange: setHighlight,
    onAccept: (index) => handleAdd(suggestions[index].name),
    popupShown: searching,
    onClose: () => {
      setOpen(false);
      setHighlight(-1);
    },
    onOpen: () => setOpen(true),
    onEnterWithoutOption: () => {
      if (query.trim()) {
        handleAdd(query.trim());
      }
    },
    onEscapeClosed: () => setQuery(''),
    highlightOnHover: true,
  });

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
          {...inputProps}
          aria-label={t('DeckEditor.quickAdd.label')}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
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

      <div
        hidden={!searching}
        className={[
          'absolute right-0 left-0 top-full mt-1 z-20 rounded-md',
          'bg-bg-surface border border-border-subtle shadow-glow overflow-hidden',
        ].join(' ')}
      >
        {searching && loading && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
            <Loader2 size={11} className="animate-spin" /> {t('DeckEditor.quickAdd.searching')}
          </div>
        )}
        {listed && suggestions.length === 0 && (
          <div className="px-3 py-2 text-xs text-text-muted italic">{t('DeckEditor.quickAdd.noMatches')}</div>
        )}
        <ul
          id={listboxId}
          role="listbox"
          hidden={!inputProps['aria-expanded']}
          aria-label={t('DeckEditor.quickAdd.listLabel')}
        >
          {suggestions.map((s, i) => {
            const option = getOptionProps(i);
            return (
              <li
                key={s.name}
                {...option}
                className={[
                  'px-3 py-1.5 text-sm text-text-primary truncate cursor-pointer transition-colors',
                  option['aria-selected'] ? 'bg-bg-elevated' : 'hover:bg-bg-elevated',
                ].join(' ')}
              >
                {s.name}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
