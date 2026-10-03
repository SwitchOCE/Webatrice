import { LayoutGrid, RefreshCw, Rows3, Upload } from 'lucide-react';

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
}

const VIEW_MODES: Array<{ mode: DeckListViewMode; label: string; Icon: typeof LayoutGrid }> = [
  { mode: 'card', label: 'Card view', Icon: LayoutGrid },
  { mode: 'compact', label: 'Compact view', Icon: Rows3 },
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
}: DeckListHeaderProps) {
  return (
    <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-subtle">
      <div>
        <h1 className="font-modern text-2xl font-semibold text-text-primary">My Decks</h1>
        <p className="text-sm text-text-muted mt-0.5">
          {loading
            ? 'Loading…'
            : `${deckCount} ${deckCount === 1 ? 'deck' : 'decks'} on this server`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {/* Segmented control: the active option carries the accent tint. */}
        <div
          role="group"
          aria-label="View mode"
          className="flex items-center gap-0.5 p-0.5 rounded-md bg-bg-elevated border border-border-subtle"
        >
          {VIEW_MODES.map(({ mode, label, Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewModeChange(mode)}
              aria-pressed={viewMode === mode}
              title={label}
              aria-label={label}
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
          title="Refresh"
          aria-label="Refresh deck list"
        >
          <RefreshCw size={16} />
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={!isConnected}
          className={[
            'inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium',
            'text-text-primary bg-bg-elevated border border-border-strong',
            'hover:bg-border-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
          ].join(' ')}
        >
          <Upload size={14} /> Import
        </button>
        <NewDeckButton onClick={onCreate} disabled={!isConnected} />
      </div>
    </div>
  );
}
