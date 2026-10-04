import { useTranslation } from 'react-i18next';
import { LayoutGrid, Link2, RefreshCw, Rows3, Share2, Upload } from 'lucide-react';

import type { DeckListViewMode } from '../../hooks/useDeckListViewMode';
import { NewDeckButton } from './DeckListStates';

export interface DeckListHeaderProps {
  loading: boolean;
  deckCount: number;
  /** Disables the server actions while disconnected. */
  isConnected: boolean;
  viewMode: DeckListViewMode;
  onViewModeChange: (mode: DeckListViewMode) => void;
  onRefresh: () => void;
  onImport: () => void;
  onCreate: () => void;
  /** Paste a share link to open (Servatrice 3.1 only). */
  onOpenShareLink?: () => void;
  /** Review and revoke the user's share links (Servatrice 3.1 only). */
  onShareLinks?: () => void;
}

const SECONDARY_BUTTON_CLASS = [
  'inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium',
  'text-text-primary bg-bg-elevated border border-border-strong',
  'hover:bg-border-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
].join(' ');

const VIEW_MODES: Array<{ mode: DeckListViewMode; Icon: typeof LayoutGrid }> = [
  { mode: 'card', Icon: LayoutGrid },
  { mode: 'compact', Icon: Rows3 },
];

/** MyDecks title, deck count, view-mode toggle and the list actions. */
export function DeckListHeader({
  loading,
  deckCount,
  isConnected,
  viewMode,
  onViewModeChange,
  onRefresh,
  onImport,
  onCreate,
  onOpenShareLink,
  onShareLinks,
}: DeckListHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-subtle">
      <div>
        <h1 className="font-modern text-2xl font-semibold text-text-primary">{t('Decks.list.title')}</h1>
        <p className="text-sm text-text-muted mt-0.5">
          {loading
            ? t('Common.status.loading')
            : t('Decks.list.deckCount', { count: deckCount })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {/* Segmented control: the active option carries the accent tint. */}
        <div
          role="group"
          aria-label={t('Decks.list.viewMode')}
          className="flex items-center gap-0.5 p-0.5 rounded-md bg-bg-elevated border border-border-subtle"
        >
          {VIEW_MODES.map(({ mode, Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewModeChange(mode)}
              aria-pressed={viewMode === mode}
              title={t(`Decks.list.view.${mode}`)}
              aria-label={t(`Decks.list.view.${mode}`)}
              className={[
                'p-1.5 rounded transition-colors',
                viewMode === mode
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-base',
              ].join(' ')}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!isConnected}
          className={[
            'p-2 rounded-md text-text-secondary hover:text-text-primary',
            'hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
          ].join(' ')}
          title={t('Decks.list.refresh')}
          aria-label={t('Decks.list.refreshLabel')}
        >
          <RefreshCw size={16} />
        </button>
        {onShareLinks && (
          <button type="button" onClick={onShareLinks} disabled={!isConnected} className={SECONDARY_BUTTON_CLASS}>
            <Share2 size={14} /> {t('DeckShareLinks.open')}
          </button>
        )}
        {onOpenShareLink && (
          <button type="button" onClick={onOpenShareLink} disabled={!isConnected} className={SECONDARY_BUTTON_CLASS}>
            <Link2 size={14} /> {t('OpenShareLink.open')}
          </button>
        )}
        <button type="button" onClick={onImport} disabled={!isConnected} className={SECONDARY_BUTTON_CLASS}>
          <Upload size={14} /> {t('Decks.list.import')}
        </button>
        <NewDeckButton onClick={onCreate} disabled={!isConnected} />
      </div>
    </div>
  );
}
