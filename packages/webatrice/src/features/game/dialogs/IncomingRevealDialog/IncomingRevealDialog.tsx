import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Loader2, X } from 'lucide-react';

import { useSeatDragSource } from '../../components/ui/SeatDragContext';
import { useCardCatalogMeta } from '../shared/useCardCatalogMeta';
import { zoneLabel } from '../shared/zoneLabels';
import { useFloatingPanelGeometry } from '../shared/useFloatingPanelGeometry';
import { useZoneViewPreferences } from '../shared/useZoneViewPreferences';
import { ZoneCardCell } from '../shared/ZoneCardCell';
import { ZoneCardGroups } from '../shared/ZoneCardGroups';
import { PileViewToggle, ZoneViewSortControls } from '../shared/ZoneViewControls';
import { buildCardGroups, type GroupMode, type SortMode } from '../shared/zoneViewSort';
import { useIncomingReveal } from './useIncomingReveal';

/** Where the view keeps its geometry and choices, apart from the library view's so the two are tuned independently. */
const STORAGE_KEY = 'webatrice.incomingReveal';
const MIN_SIZE = { w: 400, h: 300 };
const DEFAULT_SIZE = { w: 900, h: 520 };

/** "P2 reveals their library", or "A player reveals …" when the sender is unknown. */
export function incomingRevealTitle(t: TFunction, sourceName: string | undefined, zoneName: string): string {
  return `${sourceName ?? 'A player'} reveals their ${zoneLabel(t, zoneName, 'inline')}`;
}

/**
 * Receiver-side view for Event_RevealCards: pops up whenever someone reveals
 * a zone to us (e.g. "Reveal library to All players"), with the sort, group
 * and pile-view controls of the library view. The receiver doesn't have the
 * source's deck locally, so the card metadata is looked up by name.
 */
export default function IncomingRevealDialog() {
  const incoming = useIncomingReveal();
  return incoming.reveal ? <IncomingRevealPanel {...incoming} reveal={incoming.reveal} /> : null;
}

type IncomingReveal = ReturnType<typeof useIncomingReveal>;

function IncomingRevealPanel({
  reveal,
  sourceName,
  cards,
  localPlayerId,
  canDragLent,
  close,
}: IncomingReveal & { reveal: NonNullable<IncomingReveal['reveal']> }) {
  const { t } = useTranslation();
  const { groupBy, setGroupBy, sortBy, setSortBy, pileView, setPileView } = useZoneViewPreferences(STORAGE_KEY);
  // A new reveal arriving while one is open opens the panel again.
  const { panelRef, panelStyle, dragging, onHeaderPointerDown } = useFloatingPanelGeometry({
    storageKey: STORAGE_KEY,
    minSize: MIN_SIZE,
    initialSize: DEFAULT_SIZE,
    openKey: reveal,
  });

  // The drag runs on the game's DnD coordinator as a drag from the local seat
  // with the lender as the zone's owner, so Command_MoveCard starts in the
  // lender's zone; as from desktop's view, only a battlefield takes the drop.
  // A revealed card's id is its deck position (the zoneViewRevealed reindex;
  // view_zone_logic.cpp:92-124), which the move sends as card_id.
  const startLentDrag = useSeatDragSource('incoming-reveal', {
    seatPlayerId: localPlayerId ?? -1,
    zone: 'library',
    lenderPlayerId: reveal.sourceOwnerId,
    disabled: !canDragLent,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Until every name has its metadata the cards list ungrouped and unsorted,
  // so a misleading "Other (N)" bucket never flashes.
  const { metaByName, metadataLoaded } = useCardCatalogMeta(cards);
  const effectiveGroupBy: GroupMode = metadataLoaded ? groupBy : 'none';
  const effectiveSortBy: SortMode = metadataLoaded ? sortBy : 'none';
  const groups = useMemo(
    () => buildCardGroups(cards, metaByName, { sortBy: effectiveSortBy, groupBy: effectiveGroupBy }),
    [cards, metaByName, effectiveSortBy, effectiveGroupBy],
  );

  const title = incomingRevealTitle(t, sourceName, reveal.zoneName);

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-6 pointer-events-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={panelRef}
        className={[
          'bg-bg-surface border border-border-subtle rounded-lg',
          'shadow-glow flex flex-col pointer-events-auto resize overflow-hidden',
        ].join(' ')}
        style={panelStyle}
      >
        {/* Header — title + pile-view toggle + close. */}
        <div
          onPointerDown={onHeaderPointerDown}
          className={[
            'px-4 py-3 border-b border-border-subtle flex items-center gap-3 shrink-0 select-none',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
          ].join(' ')}
        >
          <div className="min-w-0 flex-1">
            <h2 className="font-modern text-base font-semibold text-text-primary truncate">
              {title}
            </h2>
            <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5">
              {cards.length} card{cards.length === 1 ? '' : 's'}
              {reveal.grantWriteAccess
                ? ' — write access granted (drag a card onto your battlefield)'
                : ''}
              {/* Without the spinner a still-loading reveal reads as a wrong
                  "1 Creature, rest in Other". */}
              {!metadataLoaded && (
                <span className="inline-flex items-center gap-1 text-text-muted italic">
                  <Loader2 size={12} className="animate-spin" />
                  loading card details…
                </span>
              )}
            </p>
          </div>
          <PileViewToggle groupBy={groupBy} pileView={pileView} onChange={setPileView} />
          <button
            type="button"
            onClick={close}
            className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Controls — group + sort dropdowns. */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
          <ZoneViewSortControls groupBy={groupBy} sortBy={sortBy} onGroupByChange={setGroupBy} onSortByChange={setSortBy} />
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4">
          {!metadataLoaded && (
            <div className="text-xs text-text-muted italic mb-3 select-none">
              Loading card details…
            </div>
          )}
          {cards.length === 0 ? (
            <div className="text-sm text-text-muted italic">
              No cards to show.
            </div>
          ) : (
            <ZoneCardGroups
              groups={groups}
              pile={pileView && effectiveGroupBy !== 'none'}
              renderCell={(c, _g, place) => (
                <ZoneCardCell
                  card={c.handCard}
                  pile={place}
                  className="shrink-0"
                  onPointerDown={canDragLent ? (e) => startLentDrag(e, [c.handCard]) : undefined}
                />
              )}
            />
          )}
        </div>

        <div className="px-4 py-3 border-t border-border-subtle flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={close}
            className={[
              'px-3 py-1.5 rounded-md text-sm font-semibold bg-accent',
              'text-white hover:bg-accent-hover shadow-glow transition-colors',
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
