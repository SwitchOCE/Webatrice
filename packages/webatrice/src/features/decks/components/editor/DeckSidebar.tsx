import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Check, CircleAlert, Loader2, Share2, Upload } from 'lucide-react';

import type { SaveState } from '../../hooks/useDeckAutosave';
import type { PriceLookup } from '../../pricing';
import type { DeckCard, HydratedDeck } from '../../types';
import { FormatPicker } from '../FormatPicker';
import { DeckBuyButton } from './DeckBuyButton';
import { DeckCardPreview } from './DeckCardPreview';

export interface DeckSidebarProps {
  deck: HydratedDeck;
  saveState: SaveState;
  /** Re-send the deck after a failed save. */
  onRetrySave: () => void;
  totalMainboardCount: number;
  totalSideboardCount: number;
  onNameChange: (name: string) => void;
  onFormatChange: (format: string) => void;
  onExport: () => void;
  /** The editor's "Open deck…" action (OpenDeckButton). */
  openDeck?: ReactNode;
  /** Desktop "Share deck..." (Servatrice 3.1 only). */
  onShare?: () => void;
  previewCard: DeckCard | null;
  prices: PriceLookup;
  pricesLoading: boolean;
  /** Format-gated features flag. When false, hide the card preview,
   *  the TCGplayer deck-total pill, and switch the display to a
   *  non-MTG friendly layout. */
  isMtg: boolean;
  /** Under the save state: undo/redo and the history list. */
  headerActions?: ReactNode;
  /** Under the format picker: legality, banner card and tags. */
  details?: ReactNode;
}

export function DeckSidebar({
  deck,
  saveState,
  onRetrySave,
  totalMainboardCount,
  totalSideboardCount,
  onNameChange,
  onFormatChange,
  onExport,
  openDeck,
  onShare,
  previewCard,
  prices,
  pricesLoading,
  isMtg,
  headerActions,
  details,
}: DeckSidebarProps) {
  const { t } = useTranslation();
  return (
    <aside className="min-h-0 flex flex-col border-r border-border-subtle bg-bg-surface">
      <div className="shrink-0 px-4 py-3 border-b border-border-subtle">
        <input
          type="text"
          value={deck.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Untitled Deck"
          className={[
            'w-full bg-transparent border-none outline-none font-modern text-xl',
            'font-semibold text-text-primary placeholder:text-text-muted',
            'focus:bg-bg-elevated focus:px-2 focus:py-1 focus:-mx-2 focus:-my-1 focus:rounded-md transition-all',
          ].join(' ')}
        />
        <div className="text-xs text-text-muted mt-1 tabular-nums">
          {totalMainboardCount} card{totalMainboardCount === 1 ? '' : 's'}
          {totalSideboardCount > 0 && <> · {totalSideboardCount} sideboard</>}
        </div>
        <div className="text-xs mt-1">
          <SaveIndicator state={saveState} onRetry={onRetrySave} />
        </div>
        {headerActions && <div className="mt-2">{headerActions}</div>}

        <div className="mt-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Format
          </span>
          <FormatPicker value={deck.format} onChange={onFormatChange} variant="sidebar" />
        </div>
        {details && <div className="mt-3 space-y-3">{details}</div>}

        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={onExport}
            title="Export deck (plain text, Arena, Cockatrice)"
            className={[
              'w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5',
              'rounded-md border border-border-strong bg-bg-elevated',
              'hover:bg-border-subtle text-text-primary text-sm font-medium transition-colors',
            ].join(' ')}
          >
            <Upload size={13} /> Export deck
          </button>
          {openDeck}
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              className={[
                'w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5',
                'rounded-md border border-border-strong bg-bg-elevated',
                'hover:bg-border-subtle text-text-primary text-sm font-medium transition-colors',
              ].join(' ')}
            >
              <Share2 size={13} /> {t('DeckSharing.shareDeck')}
            </button>
          )}
          {/* Deck-total TCGplayer pill only makes sense when the cards
              are MTG (Scryfall pricing has no coverage for anything
              else). Non-MTG decks drop the row entirely. */}
          {isMtg && <DeckBuyButton cards={deck.cards} prices={prices} loading={pricesLoading} />}
        </div>
      </div>

      {isMtg ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <DeckCardPreview card={previewCard} prices={prices} />
        </div>
      ) : (
        // Non-MTG placeholder — nothing to preview or price, so the
        // rail is intentionally empty. Left as a spacer so the sidebar
        // doesn't collapse into a thin strip.
        <div className="flex-1 min-h-0 overflow-y-auto p-6" />
      )}
    </aside>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const { t } = useTranslation();
  switch (state) {
    case 'saving':
      return (
        <span className="inline-flex items-center gap-1 text-text-muted">
          <Loader2 size={10} className="animate-spin" /> Saving…
        </span>
      );
    case 'dirty':
      return <span className="text-warning">Unsaved changes</span>;
    case 'saved':
      return (
        <span className="inline-flex items-center gap-1 text-success">
          <Check size={10} /> Saved
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-danger" role="alert" title={t('DeckSidebar.saveFailedHint')}>
          <CircleAlert size={10} /> {t('DeckSidebar.saveFailed')}
          <button type="button" onClick={onRetry} className="underline hover:text-danger/80">
            {t('DeckSidebar.retrySave')}
          </button>
        </span>
      );
    default:
      return null;
  }
}
