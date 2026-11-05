import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BracketBadge, DeckArt, DeckCardFace, IdentityPips, useDeckAge } from '@app/components';
import { cx } from '@app/utils';

import type { DeckTileView } from '../../deckGrid';
import { formatDisplayLabel } from '../../deckSummary';
import { DeckActionsMenu, type DeckActions } from './DeckActionsMenu';
import { DeckPriceBadge, DeckVisibilityBadge, TagChip } from './DeckBadges';

export interface DeckTileProps {
  view: DeckTileView;
  actions: DeckActions;
  onPrefetch?: () => void;
}

function useFormatLine(view: DeckTileView): string | null {
  const { t } = useTranslation();
  const format = view.summary?.format ? formatDisplayLabel(view.summary.format, t) : null;
  const cards = view.summary?.cardCount != null ? t('DeckTile.cards', { count: view.summary.cardCount }) : null;
  return [format, cards].filter(Boolean).join(' · ') || null;
}

export function DeckTile({ view, actions, onPrefetch }: DeckTileProps) {
  const { t } = useTranslation();
  const formatDescriptionId = useId();
  const { deck, summary } = view;
  const [menuOpen, setMenuOpen] = useState(false);
  const format = summary?.format ? formatDisplayLabel(summary.format, t) : null;
  return (
    <article
      aria-label={deck.name}
      onFocus={onPrefetch}
      onPointerEnter={onPrefetch}
      className={cx(
        'relative flex flex-col rounded-ui-lg border bg-bg-surface transition-colors',
        menuOpen ? 'border-accent/70' : 'border-border-subtle hover:border-border-strong',
      )}
    >
      <button
        type="button"
        onClick={actions.onOpen}
        aria-label={t('DeckTile.open', { name: deck.name })}
        aria-describedby={summary && !format ? formatDescriptionId : undefined}
        className={cx(
          'group flex flex-col rounded-t-ui-lg text-left',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        <DeckCardFace
          name={deck.name}
          artUrl={view.artUrl}
          colours={view.colours}
          format={format}
          formatFamily={view.formatFamily}
          formatKnown={!!summary}
          formatDescriptionId={formatDescriptionId}
          bracket={view.bracket}
          creationTime={deck.creationTime}
          cardCount={summary?.cardCount}
          visibilityBadge={<DeckVisibilityBadge visibility={deck.visibility} kind="deck" />}
        />
      </button>
      <div className="flex items-center gap-1.5 border-t border-border-subtle/70 p-2">
        <ul className="mr-1 flex h-5 min-w-0 flex-1 flex-wrap gap-1.5 overflow-hidden" aria-label={t('DeckTile.tags')}>
          {view.tags.map((tag) => (
            <li key={tag} className="min-w-0 max-w-full"><TagChip>{tag}</TagChip></li>
          ))}
        </ul>
        <DeckPriceBadge price={summary && { usd: summary.usd, missing: summary.missing }} className="shrink-0 text-[12px]" />
        <DeckActionsMenu deck={deck} actions={actions} onOpenChange={setMenuOpen} />
      </div>
    </article>
  );
}

export function DeckListRow({ view, actions, onPrefetch }: DeckTileProps) {
  const { t } = useTranslation();
  const { deck, summary } = view;
  const formatLine = useFormatLine(view);
  const created = useDeckAge(deck.creationTime);
  return (
    <article
      aria-label={deck.name}
      onFocus={onPrefetch}
      onPointerEnter={onPrefetch}
      className={cx(
        'flex items-center gap-3 rounded-ui border border-border-subtle bg-bg-surface pr-2 transition-colors',
        'hover:border-border-strong',
      )}
    >
      <button
        type="button"
        onClick={actions.onOpen}
        aria-label={t('DeckTile.open', { name: deck.name })}
        className={cx(
          'group flex min-w-0 flex-1 items-center gap-3 rounded-ui py-2 pl-2 text-left',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
        )}
      >
        <DeckArt url={view.artUrl} className="h-10 w-14 shrink-0 rounded-ui-sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-text-primary group-hover:text-accent">{deck.name}</span>
            {view.bracket != null && <BracketBadge level={view.bracket} />}
            <DeckVisibilityBadge visibility={deck.visibility} kind="deck" className="bg-accent/15" />
          </span>
          <span className="flex min-w-0 items-center gap-2 text-[12px] text-text-muted">
            {view.colours !== undefined && <IdentityPips colours={view.colours} size={9} />}
            {formatLine && <span className="text-text-secondary">{formatLine}</span>}
            <span className="truncate">{created}</span>
          </span>
        </span>
      </button>
      <ul className="hidden h-5 max-w-[40%] flex-wrap gap-1 overflow-hidden lg:flex" aria-label={t('DeckTile.tags')}>
        {view.tags.map((tag) => (
          <li key={tag} className="min-w-0 max-w-full"><TagChip>{tag}</TagChip></li>
        ))}
      </ul>
      <DeckPriceBadge price={summary && { usd: summary.usd, missing: summary.missing }} className="w-20 shrink-0 text-right text-[12px]" />
      <DeckActionsMenu deck={deck} actions={actions} />
    </article>
  );
}
