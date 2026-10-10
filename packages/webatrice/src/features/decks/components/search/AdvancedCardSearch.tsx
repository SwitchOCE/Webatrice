import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';

import { EMPTY_FILTERS, buildScryfallQuery, type SearchFiltersState } from '../../cardSearchQuery';
import { useScryfallCardSearch } from '../../hooks/useScryfallCardSearch';
import { searchCardAsPreview, searchCardImage } from '../../search';
import type { DeckCard } from '../../types';
import { CardSearchFilters } from './CardSearchFilters';

const SYNTAX_EXAMPLES = { oracleExample: 'o:"draw a card"', commanderExample: 'is:commander' };

export function AdvancedCardSearch({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  onAddByName,
  onPreviewCard,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  filters: SearchFiltersState;
  onFiltersChange: (f: SearchFiltersState) => void;
  onAddByName: (name: string) => void;
  onPreviewCard: (card: DeckCard | null) => void;
}) {
  const { t } = useTranslation();
  const [added, setAdded] = useState<string | null>(null);
  const composedQuery = useMemo(() => buildScryfallQuery(query, filters), [query, filters]);
  const { results, loading, error } = useScryfallCardSearch(composedQuery);

  return (
    <>
      <div className="shrink-0 px-6 py-3 border-b border-border-subtle bg-bg-surface/50 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('CardSearch.placeholder')}
            aria-label={t('CardSearch.label')}
            autoFocus
            className={[
              'w-full bg-bg-base border border-border-subtle rounded-md pl-10 pr-3 py-2',
              'text-sm text-text-primary placeholder:text-text-muted focus:outline-none',
              'focus:border-accent focus:ring-1 focus:ring-accent transition-colors',
            ].join(' ')}
          />
        </div>

        <CardSearchFilters
          value={filters}
          onChange={onFiltersChange}
          onReset={() => onFiltersChange(EMPTY_FILTERS)}
        />

        <div role="status" className="text-xs text-text-muted h-4">
          {loading && t('CardSearch.searching')}
          {error !== null && (
            <span className="text-danger">
              {error.kind === 'badQuery'
                ? t('CardSearch.badQuery', { details: error.details })
                : t('CardSearch.searchFailed')}
            </span>
          )}
          {!loading && error === null && composedQuery && (
            <span>
              {t('CardSearch.resultCount', { count: results.length })} · <span className="font-mono">{composedQuery}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {results.length === 0 && !loading && error === null && (
          <div className="h-full flex items-center justify-center text-sm text-text-muted text-center max-w-md mx-auto">
            {composedQuery ? t('CardSearch.noResults') : (
              <div>
                <p>{t('CardSearch.emptyPrompt')}</p>
                <p className="mt-2 text-xs">
                  <Trans
                    i18nKey="CardSearch.syntaxHint"
                    values={SYNTAX_EXAMPLES}
                    components={[
                      <span key="oracle" className="font-mono" />,
                      <span key="commander" className="font-mono" />,
                    ]}
                  />
                </p>
              </div>
            )}
          </div>
        )}

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
        >
          {results.map((card) => {
            const img = searchCardImage(card);
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  onAddByName(card.name);
                  setAdded(card.name);
                }}
                onMouseEnter={() => onPreviewCard(searchCardAsPreview(card))}
                onFocus={() => onPreviewCard(searchCardAsPreview(card))}
                aria-label={t('CardSearch.addCardTitle', { name: card.name })}
                className={[
                  'aspect-[5/7] w-full rounded-lg overflow-hidden bg-bg-surface border',
                  'border-border-subtle hover:border-accent hover:shadow-glow',
                  'transition-all group relative cursor-pointer focus:outline-none focus:border-accent',
                  'focus-visible:ring-2 focus-visible:ring-accent',
                ].join(' ')}
                title={t('CardSearch.addCardTitle', { name: card.name })}
              >
                {img ? (
                  <img
                    src={img}
                    alt={card.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <div className="h-full flex flex-col p-3">
                    <div className="text-sm font-semibold text-text-primary truncate">{card.name}</div>
                    <div className="mt-auto text-xs text-text-muted">{card.type_line ?? ''}</div>
                  </div>
                )}
                <div
                  className={[
                    'absolute inset-0 bg-black/0 group-hover:bg-black/60 group-focus-visible:bg-black/60',
                    'transition-colors flex items-center justify-center',
                    'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                  ].join(' ')}
                  aria-hidden
                >
                  <span
                    className={[
                      'px-3 py-1.5 rounded-md bg-accent text-white text-xs',
                      'font-semibold shadow-glow flex items-center gap-1 border border-transparent',
                    ].join(' ')}
                  >
                    <Plus size={12} /> {t('CardSearch.addToDeck')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <p role="status" className="sr-only">{added ? t('CardSearch.added', { name: added }) : ''}</p>
      </div>
    </>
  );
}
