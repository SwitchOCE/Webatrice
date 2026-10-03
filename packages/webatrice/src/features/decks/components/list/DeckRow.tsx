import { FileText, Trash2 } from 'lucide-react';

import { deckArtUrl, formatDisplayLabel, type DeckSummary } from '../../deckSummary';
import { formatDeckAge, type FlatDeck } from '../../deckTree';
import type { DeckListViewMode } from '../../hooks/useDeckListViewMode';
import { BracketBadge, DeckPriceBadge } from './DeckBadges';

export interface DeckRowProps {
  deck: FlatDeck;
  /** `undefined` while the deck's XML hasn't landed — the row still
   *  renders, just without price, bracket or art. */
  summary: DeckSummary | undefined;
  mode: DeckListViewMode;
  onOpen: () => void;
  onDelete: () => void;
}

export function DeckRow(props: DeckRowProps) {
  return props.mode === 'compact' ? <DeckRowCompact {...props} /> : <DeckRowCard {...props} />;
}

/** Format · created · folder · price line shared by both row layouts. */
function DeckRowMeta({ deck, summary, className }: {
  deck: FlatDeck;
  summary: DeckSummary | undefined;
  className: string;
}) {
  const formatLabel = summary?.format ? formatDisplayLabel(summary.format) : null;
  return (
    <div className={className}>
      {formatLabel && (
        <>
          <span className="text-text-secondary">{formatLabel}</span>
          <span>·</span>
        </>
      )}
      <span>Created {formatDeckAge(deck.creationTime)}</span>
      {deck.path && (
        <>
          <span>·</span>
          <span>in <span className="text-text-secondary">{deck.path}</span></span>
        </>
      )}
      <span>·</span>
      <DeckPriceBadge price={summary && { usd: summary.usd, missing: summary.missing }} />
    </div>
  );
}

/**
 * "Card" layout: a tall row with the banner/commander art bleeding in
 * from the right, gradient-blended into the row surface. The whole card
 * opens the deck; delete floats top-right so it stays reachable over the
 * art.
 */
function DeckRowCard({ deck, summary, onOpen, onDelete }: DeckRowProps) {
  const artUrl = deckArtUrl(summary);
  const bracket = summary?.bracketLevel;

  return (
    <div
      className={[
        'group relative rounded-lg bg-bg-surface border',
        'border-border-subtle hover:border-border-strong overflow-hidden transition-all',
      ].join(' ')}
    >
      {/* Right-half art: the image, then a gradient fading it into the
          row surface so the text on the left stays legible. Without art
          a placeholder underlay takes its place. */}
      {artUrl ? (
        <>
          <div
            className="absolute inset-y-0 right-0 w-1/2 pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity"
            style={{
              backgroundImage: `url(${artUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center 30%',
            }}
            aria-hidden
          />
          <div
            className="absolute inset-y-0 right-0 w-1/2 pointer-events-none"
            style={{
              background:
                'linear-gradient(115deg, rgb(var(--bg-surface)) 15%, rgb(var(--bg-surface) / 0.35) 40%, rgb(var(--bg-surface) / 0) 70%)',
            }}
            aria-hidden
          />
        </>
      ) : (
        <div className="absolute inset-y-0 right-0 w-1/2 pointer-events-none flex items-center justify-end pr-8" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(115deg, rgb(var(--bg-surface)) 30%, rgb(var(--bg-elevated) / 0.6) 100%)',
            }}
          />
          <FileText size={72} className="relative text-text-muted/10" strokeWidth={1.25} />
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="relative w-full text-left flex items-center gap-4 p-5 min-h-32 cursor-pointer"
      >
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
              {deck.name}
            </span>
            {bracket != null && <BracketBadge level={bracket} />}
          </div>
          <DeckRowMeta
            deck={deck}
            summary={summary}
            className="text-xs text-text-muted flex items-center gap-2 flex-wrap"
          />
        </div>
      </button>

      <div className="absolute top-3 right-3 z-10">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={[
            'p-2 rounded-md bg-bg-surface/80 backdrop-blur-sm border',
            'border-border-subtle text-text-muted hover:text-danger',
            'hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all',
          ].join(' ')}
          title="Delete deck"
          aria-label={`Delete ${deck.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * "Compact" layout: one line with a small art thumbnail on the left,
 * name + bracket + meta, delete on the right.
 */
function DeckRowCompact({ deck, summary, onOpen, onDelete }: DeckRowProps) {
  const artUrl = deckArtUrl(summary);
  const bracket = summary?.bracketLevel;

  return (
    <div
      className={[
        'group flex items-center gap-3 rounded-md bg-bg-surface border',
        'border-border-subtle hover:border-border-strong transition-colors',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2 text-left cursor-pointer"
      >
        <div
          className={[
            'h-10 w-10 shrink-0 rounded overflow-hidden bg-bg-elevated',
            'border border-border-subtle flex items-center justify-center',
          ].join(' ')}
        >
          {artUrl ? (
            <div
              className="h-full w-full"
              style={{
                backgroundImage: `url(${artUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center 30%',
              }}
              aria-hidden
            />
          ) : (
            <FileText size={16} className="text-text-muted" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
              {deck.name}
            </span>
            {bracket != null && <BracketBadge level={bracket} />}
          </div>
          <DeckRowMeta
            deck={deck}
            summary={summary}
            className="text-xs text-text-muted flex items-center gap-1.5 flex-wrap mt-0.5"
          />
        </div>
      </button>

      <button
        type="button"
        onClick={onDelete}
        className={[
          'mr-2 p-2 rounded-md text-text-muted hover:text-danger hover:bg-red-500/10',
          'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shrink-0',
        ].join(' ')}
        title="Delete deck"
        aria-label={`Delete ${deck.name}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
