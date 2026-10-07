import type { HTMLAttributes, PointerEvent as ReactPointerEvent, Ref } from 'react';
import { createPortal } from 'react-dom';
import { setRef } from '@mui/material/utils';
import { X } from 'lucide-react';

import { CARD_WIDTH } from '../../components/ui/SeatCard/cardSize';
import { useFloatingPanelGeometry } from '../shared/useFloatingPanelGeometry';
import { ZoneCardCell } from '../shared/ZoneCardCell';

type HandCard = { id: string; name: string; scryfallId: string };

/**
 * ZoneViewDialog's ordered body: the top / bottom N cards of a library.
 * Ports Cockatrice's ZoneViewWidget behavior for the bounded-reveal path:
 *   • Cards render in the zone's server order — NO sort or group
 *     controls (Cockatrice deliberately keeps this a flat, ordered
 *     window so tutors / scries / rearranges preserve intent).
 *   • Cards can be dragged out to any play-area zone (parent wires
 *     `onCardPointerDown` into its normal beginDrag flow), and drops
 *     landing back on the dialog resolve to the source zone via
 *     `dropRef`. Both patterns match ZoneViewPanel.
 *   • The dialog itself is draggable via the header, resizable via
 *     the browser's native `resize` handle, and non-modal (no blurred
 *     backdrop) so the play area behind stays visible and interactive.
 *   • Position + size persist to localStorage across sessions
 *     (useFloatingPanelGeometry).
 *
 * Zone-specific bits (title, labels, drag wiring) live in the caller.
 */
export interface ZoneRevealPanelProps {
  /** Human-readable title for the modal header. Caller composes
   *  something like "Top 5 cards — SonicBliss" or "Graveyard — SonicBliss". */
  title: string;
  /** Optional hint under the title (e.g. "top of library is leftmost").
   *  Omit for zones where the hint doesn't apply. */
  subtitle?: string;
  cards: readonly HandCard[];
  /** Per-card label rendered below each slot — one string per entry in
   *  `cards`, same order. Omit to render no labels. */
  labels?: readonly string[];
  /** Fired on pointerdown of a card. Parent wires this into its normal
   *  beginDrag flow so the card can be dragged to any zone in the play
   *  area. When the drop lands back on the dialog itself (see
   *  `dropRef`), the parent should resolve it as a same-zone move. */
  onCardPointerDown?: (
    e: ReactPointerEvent<HTMLElement>,
    card: HandCard,
  ) => void;
  /** Ref filled with the dialog's outer container while open. Parent's
   *  drop-detection can hit-test this rect to decide whether a drop
   *  resolves to the dialog's source zone. Same pattern ZoneViewPanel
   *  uses via its `dropRef`. */
  dropRef?: Ref<HTMLDivElement>;
  /** IDs of cards currently mid-drag from the dialog. Rendered at
   *  opacity 0 so the drag ghost is the only visible copy. */
  draggingCardIds?: Set<string>;
  /** Each card's keyboard props (useCardFocus): the row becomes a listbox
   *  of focusable cards. */
  cardInteraction?: (card: HandCard) => HTMLAttributes<HTMLDivElement> & { ref?: (element: HTMLElement | null) => void };
  /** Called when the dialog closes (X button or footer Close; the game's
   *  Esc closes the most recent view). */
  onClose: () => void;
}

/** Where the view keeps its geometry: one place for every top / bottom N view,
 *  whichever zone it shows. */
const STORAGE_KEY = 'webatrice.zoneReveal';
const MIN_SIZE = { w: 400, h: 240 };
const DEFAULT_SIZE = { w: 900, h: 480 };

export default function ZoneRevealPanel({
  title,
  subtitle,
  cards,
  labels,
  onCardPointerDown,
  dropRef,
  draggingCardIds,
  cardInteraction,
  onClose,
}: ZoneRevealPanelProps) {
  const { panelRef, panelStyle, dragging, onHeaderPointerDown } = useFloatingPanelGeometry({
    storageKey: STORAGE_KEY,
    minSize: MIN_SIZE,
    initialSize: DEFAULT_SIZE,
  });

  return createPortal(
    // The outer wrapper is pointer-events: none so clicks pass through
    // to the game behind — the dialog itself is the only interactive
    // region. Matches ZoneViewPanel's non-modal behavior.
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-6 pointer-events-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        // A non-modal dialog (no aria-modal): Tab moves focus inside it
        // instead of advancing the phase, and Escape still closes the
        // most recent view.
        role="dialog"
        aria-label={title}
        ref={(el) => {
          panelRef.current = el;
          setRef(dropRef, el);
        }}
        className={[
          'bg-bg-surface border border-border-subtle rounded-lg',
          'shadow-glow flex flex-col pointer-events-auto resize overflow-hidden',
        ].join(' ')}
        style={panelStyle}
      >
        {/* Header — grab handle for dragging the dialog. */}
        <div
          onPointerDown={onHeaderPointerDown}
          className={[
            'px-4 py-3 border-b border-border-subtle flex items-center gap-2 shrink-0 select-none',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
          ].join(' ')}
        >
          <div className="min-w-0 flex-1">
            <h2 className="font-modern text-base font-semibold text-text-primary truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cards row — wraps when the reveal is wider than the modal. */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {cards.length === 0 ? (
            <div className="text-sm text-text-muted italic">
              No cards to show.
            </div>
          ) : (
            <div
              className="flex flex-wrap gap-3"
              role={cardInteraction ? 'listbox' : undefined}
              aria-label={cardInteraction ? title : undefined}
              aria-orientation={cardInteraction ? 'horizontal' : undefined}
              aria-multiselectable={cardInteraction ? true : undefined}
            >
              {cards.map((c, i) => {
                const label = labels?.[i];
                const interaction = cardInteraction?.(c);
                return (
                  <div
                    key={`${c.id}-${i}`}
                    className="flex flex-col items-center gap-1"
                    style={{ width: CARD_WIDTH }}
                  >
                    <ZoneCardCell
                      card={c}
                      marked
                      hidden={draggingCardIds?.has(c.id)}
                      interaction={interaction}
                      selected={interaction?.['aria-selected'] === true || interaction?.['aria-selected'] === 'true'}
                      onPointerDown={onCardPointerDown && ((e) => onCardPointerDown(e, c))}
                      className="board-motion transition-opacity duration-100 ease-out"
                    />
                    {label != null && (
                      <span className="text-xs font-semibold text-text-secondary tabular-nums select-none">
                        {label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-subtle flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className={[
              'px-3 py-1.5 rounded-md text-sm font-semibold bg-accent',
              'text-white hover:bg-accent-hover shadow-glow board-motion transition-colors',
            ].join(' ')}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
