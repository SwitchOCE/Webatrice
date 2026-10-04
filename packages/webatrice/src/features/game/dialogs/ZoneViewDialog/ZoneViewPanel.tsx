import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { setRef } from '@mui/material/utils';
import { Maximize2, Minimize2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreference } from '@app/hooks';
import { cardViewRowsHeight, toggledCardViewHeight } from './cardViewHeight';
import { MARQUEE_BORDER, MARQUEE_FILL } from '../../components/ui/seatColors/seatColors';
import { useCardCatalogMeta } from '../shared/useCardCatalogMeta';
import { clampPanelSize, useFloatingPanelGeometry } from '../shared/useFloatingPanelGeometry';
import { useZoneViewPreferences } from '../shared/useZoneViewPreferences';
import { ZoneCardCell } from '../shared/ZoneCardCell';
import { ZoneCardGroups } from '../shared/ZoneCardGroups';
import { PileViewToggle, ZoneViewSortControls } from '../shared/ZoneViewControls';
import { readShuffleOnClose, writeShuffleOnClose } from '../shared/zoneViewPreferences';
import { buildCardGroups, type GroupMode, type SortMode } from '../shared/zoneViewSort';

type HandCard = { id: string; name: string; scryfallId: string };

/** Where the view keeps its geometry and choices. Cockatrice desktop persists
 *  these via SettingsCache (view_zone_widget.cpp:161-163). */
const STORAGE_KEY = 'webatrice.searchLibrary';

const MIN_SIZE = { w: 400, h: 300 };
/** The card height inside a card view (its --card-height). */
const CARD_VIEW_CARD_HEIGHT_REM = 12.6;

/**
 * A card view's measurements for desktop's row-based heights: everything around its card area
 * (title bar, controls, padding), the card area itself, and its card height in pixels.
 */
function measureCardView(dialog: HTMLElement, content: HTMLElement): { chrome: number; area: number; cardHeightPx: number } {
  const style = window.getComputedStyle(content);
  const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const area = content.getBoundingClientRect().height - paddingY;
  const rootFontSize = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  return {
    chrome: dialog.getBoundingClientRect().height - area,
    area,
    cardHeightPx: CARD_VIEW_CARD_HEIGHT_REM * rootFontSize,
  };
}

/** The height the view's cards take, without the card area's padding; 0 before layout. */
function contentsHeight(content: HTMLElement): number {
  const style = window.getComputedStyle(content);
  return content.scrollHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
}

/** The cards around a right-clicked card, in display order: every card the
 *  view shows (after the search filter), and those in its column (group). */
export interface ZoneViewCardScope {
  shownIds: string[];
  columnIds: string[];
}

type Props = {
  /** Called when the dialog closes. Receives whether the "shuffle
   *  when closing" toggle was on so the parent can dispatch the
   *  shuffle command conditionally — same behaviour as Cockatrice's
   *  ZoneViewWidget. Non-library zones (graveyard, exile) never
   *  render the toggle and always receive `false` here. */
  onClose: (shuffleOnClose: boolean) => void;
  library: readonly HandCard[];
  /** Header title: "P1's library", "Graveyard — P1". */
  title: string;
  /** Whether to render the "shuffle when closing" checkbox. On by
   *  default (library flow). Non-library zones (graveyard, exile)
   *  set this to false — Cockatrice's ZoneViewWidget only shows the
   *  toggle for library views (view_zone_widget.cpp:163-165). */
  showShuffleOnClose?: boolean;
  /** Fired when the user pointer-downs on a card. Parent wires this into
   *  its drag system so the card can be moved into any play-area zone
   *  (own or another player's battlefield). */
  onCardPointerDown?: (
    e: React.PointerEvent<HTMLElement>,
    card: HandCard,
  ) => void;
  /** Fired on right-click of a card. Parent renders its own per-card
   *  context menu — used by the graveyard / exile pile-view flow to
   *  offer Draw arrow / Clone / etc. Undefined suppresses the menu
   *  and lets the browser's default context menu through (matches the
   *  library-search flow, which has no per-card menu). */
  onCardContextMenu?: (
    e: React.MouseEvent<HTMLElement>,
    card: HandCard,
    scope: ZoneViewCardScope,
  ) => void;
  /** IDs of library cards currently being dragged by the parent. Those
   *  cards render at opacity 0 in the dialog so the user only sees the
   *  drag ghost. */
  draggingCardIds?: Set<string>;
  /** Ref filled with the dialog's outer content element while open.
   *  The parent uses it to treat drops landing inside the dialog as
   *  library drops — since the modal typically floats over the play
   *  area's library pile, drops on the modal itself must resolve to
   *  the library too. */
  dropRef?: React.Ref<HTMLDivElement>;
  /** Ids of the cards selected in the view, and the marquee's update to them. */
  selectedIds: ReadonlySet<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  /** Whose zone the cards are in, marked on each card for arrow hit-testing:
   *  an arrow pick or a right-button drag can then land on, or start from, a
   *  card in the view. */
  cardOwner?: { playerId: number; zone: string };
};

export default function ZoneViewPanel({
  onClose,
  library,
  title,
  showShuffleOnClose = true,
  onCardPointerDown,
  onCardContextMenu,
  draggingCardIds,
  dropRef,
  selectedIds,
  onSelectedIdsChange,
  cardOwner,
}: Props) {
  const [query, setQuery] = useState('');
  const focusSearchBar = usePreference('focusCardViewSearchBar');
  const cardViewInitialRowsMax = usePreference('cardViewInitialRowsMax');
  const cardViewExpandedRowsMax = usePreference('cardViewExpandedRowsMax');
  // Desktop hides the search box while "Keep game chat focused" is on: typing goes to the chat.
  const showSearchBar = !usePreference('keepGameChatFocus');
  const activeQuery = showSearchBar ? query : '';
  const { groupBy, setGroupBy, sortBy, setSortBy, pileView, setPileView } = useZoneViewPreferences(STORAGE_KEY);
  // "Shuffle when closing" toggle. Cockatrice's ZoneViewWidget
  // defaults this to on; unchecking lets the player peek at library
  // order without wrecking the game state. Persist across sessions.
  const [shuffleOnClose, setShuffleOnClose] = useState(readShuffleOnClose);
  useEffect(() => {
    writeShuffleOnClose(shuffleOnClose);
  }, [shuffleOnClose]);

  const contentRef = useRef<HTMLDivElement>(null);
  const { panelRef: dialogRef, panelStyle, dragging, onHeaderPointerDown } = useFloatingPanelGeometry({
    storageKey: STORAGE_KEY,
    minSize: MIN_SIZE,
    // Desktop's "Maximum initial height for card view window", in rows, and no taller than the
    // cards need (unknown, 0, before layout). A size the user set by hand, stored, wins.
    initialSize: (el) => {
      if (!contentRef.current) {
        return;
      }
      const { chrome, cardHeightPx } = measureCardView(el, contentRef.current);
      // As on desktop, no taller than the cards need (unknown, 0, before layout).
      const cardsHeight = contentsHeight(contentRef.current);
      const rowsHeight = cardViewRowsHeight(cardViewInitialRowsMax, cardHeightPx);
      const height = chrome + (cardsHeight > 0 ? Math.min(rowsHeight, cardsHeight) : rowsHeight);
      el.style.height = `${Math.round(clampPanelSize({ w: el.getBoundingClientRect().width, h: height }, MIN_SIZE).h)}px`;
    },
  });

  const { t } = useTranslation();
  // Whether the last expand/shrink left the view taller than its initial height (the header
  // button's pressed state).
  const [expanded, setExpanded] = useState(false);
  // Desktop's title-bar double-click (ZoneViewWidget::expandWindow): between the initial height
  // and "Maximum expanded height for card view window", never taller than the cards need (the
  // widget's maximum size) or the page allows. Expanded is never below initial, as desktop's
  // coupled spin boxes keep it.
  const toggleExpanded = () => {
    const el = dialogRef.current;
    const content = contentRef.current;
    if (!el || !content) {
      return;
    }
    const { chrome, area, cardHeightPx } = measureCardView(el, content);
    const cardsHeight = contentsHeight(content);
    const initial = cardViewRowsHeight(cardViewInitialRowsMax, cardHeightPx);
    const maxHeight = Math.min(window.innerHeight - chrome, cardsHeight > 0 ? cardsHeight : Infinity);
    const next = toggledCardViewHeight(area, {
      initial,
      expanded: cardViewRowsHeight(Math.max(cardViewExpandedRowsMax, cardViewInitialRowsMax), cardHeightPx),
      maxHeight,
    });
    setExpanded(next > Math.min(initial, maxHeight) + 1);
    el.style.height = `${Math.round(Math.max(MIN_SIZE.h, chrome + next))}px`;
  };

  // Marquee selection scoped to the view: the marquee never spans into
  // the play area behind it. The selection itself is the caller's.
  const [marquee, setMarquee] = useState<
    { x1: number; y1: number; x2: number; y2: number } | null
  >(null);

  const onContentPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const target = e.target as HTMLElement | null;
    // Skip clicks on cards themselves (future: card interaction) and any
    // controls that shouldn't kick off a marquee.
    if (target?.closest('[data-card]')) {
      return;
    }
    if (target?.closest('input, button, select, textarea, [role=\'button\']')) {
      return;
    }
    // Skip clicks that land on the content area's scrollbar — those are
    // scrollbar interactions, not selection gestures.
    const contentEl = contentRef.current;
    if (contentEl) {
      const cr = contentEl.getBoundingClientRect();
      const localX = e.clientX - cr.left;
      const localY = e.clientY - cr.top;
      const onHScrollbar =
        contentEl.scrollWidth > contentEl.clientWidth &&
        localY > contentEl.clientHeight;
      const onVScrollbar =
        contentEl.scrollHeight > contentEl.clientHeight &&
        localX > contentEl.clientWidth;
      if (onHScrollbar || onVScrollbar) {
        return;
      }
    }
    // Skip clicks on the native `resize: both` handle at the dialog's
    // bottom-right corner. Handle occupies roughly the last 20px of
    // each axis; clicking there resizes the dialog.
    const dialogEl = dialogRef.current;
    if (dialogEl) {
      const dRect = dialogEl.getBoundingClientRect();
      const RESIZE_HANDLE_SIZE = 20;
      if (
        e.clientX >= dRect.right - RESIZE_HANDLE_SIZE &&
        e.clientY >= dRect.bottom - RESIZE_HANDLE_SIZE
      ) {
        return;
      }
    }
    onSelectedIdsChange(new Set());
    setMarquee({
      x1: e.clientX,
      y1: e.clientY,
      x2: e.clientX,
      y2: e.clientY,
    });
  };

  const computeMarqueeSelection = (rect: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }) => {
    const boxEl = contentRef.current;
    if (!boxEl) {
      return new Set<string>();
    }
    const els = boxEl.querySelectorAll<HTMLElement>('[data-card]');
    const ids = new Set<string>();
    els.forEach((el) => {
      const id = el.dataset.cardId;
      if (!id) {
        return;
      }
      const r = el.getBoundingClientRect();
      const disjoint =
        r.right < rect.left ||
        r.left > rect.right ||
        r.bottom < rect.top ||
        r.top > rect.bottom;
      if (disjoint) {
        return;
      }
      ids.add(id);
    });
    return ids;
  };

  // While a marquee is active, block text selection globally. Reverts
  // when the marquee ends. Depends on `marqueeActive` (a boolean) rather
  // than the marquee state directly so the effect doesn't re-run on
  // every pointermove — only when the marquee turns on / off.
  const marqueeActive = marquee !== null;
  useEffect(() => {
    if (!marqueeActive) {
      return;
    }
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [marqueeActive]);

  useEffect(() => {
    if (!marquee) {
      return;
    }
    const onMove = (e: PointerEvent) => {
      const rect = {
        left: Math.min(marquee.x1, e.clientX),
        right: Math.max(marquee.x1, e.clientX),
        top: Math.min(marquee.y1, e.clientY),
        bottom: Math.max(marquee.y1, e.clientY),
      };
      onSelectedIdsChange(computeMarqueeSelection(rect));
      setMarquee((m) =>
        m ? { ...m, x2: e.clientX, y2: e.clientY } : null,
      );
    };
    const onUp = () => setMarquee(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [marquee, onSelectedIdsChange]);

  const { metaByName, metadataLoaded } = useCardCatalogMeta(library);
  const effectiveGroupBy: GroupMode = metadataLoaded ? groupBy : 'none';
  const effectiveSortBy: SortMode = metadataLoaded ? sortBy : 'none';
  const groups = useMemo(
    () => buildCardGroups(library, metaByName, { query: activeQuery, sortBy: effectiveSortBy, groupBy: effectiveGroupBy }),
    [library, metaByName, activeQuery, effectiveSortBy, effectiveGroupBy],
  );

  const totalShown = groups.reduce((n, g) => n + g.cards.length, 0);
  const shownIds = groups.flatMap((g) => g.cards.map((c) => c.handCard.id));
  const pile = pileView && groupBy !== 'none';

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-6 pointer-events-none"
      // React portals still bubble synthetic events up the React tree,
      // which would let a pointerdown here reach the ancestor seat
      // and start a marquee behind the dialog. Stop propagation at the
      // portal boundary for both mouse (backdrop close) and pointer
      // (drag start / card interactions).
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        // A non-modal dialog (no aria-modal): Tab moves focus inside it
        // instead of advancing the phase, and Escape still closes the
        // most recent view.
        role="dialog"
        aria-label={title}
        ref={(el) => {
          dialogRef.current = el;
          setRef(dropRef, el);
        }}
        className={[
          'bg-bg-surface border border-border-subtle rounded-lg',
          'shadow-glow w-[min(1100px,95vw)] h-[min(85vh,900px)]',
          'max-w-screen max-h-screen flex flex-col pointer-events-auto resize overflow-hidden',
        ].join(' ')}
        // Override the shared card-size CSS variables so every card
        // inside the dialog renders bigger than in the play area.
        // Cards use these vars via cardSize.ts, so nothing else changes.
        style={
          {
            '--card-width': '9rem',
            '--card-height': `${CARD_VIEW_CARD_HEIGHT_REM}rem`,
            ...panelStyle,
          } as React.CSSProperties
        }
      >
        {/* Header */}
        <div
          onPointerDown={onHeaderPointerDown}
          onDoubleClick={(e) => {
            // The header's buttons take their own clicks.
            if (!(e.target as HTMLElement).closest('button')) {
              toggleExpanded();
            }
          }}
          className={[
            'flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0 select-none',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
          ].join(' ')}
        >
          <h2 className="text-lg font-semibold text-text-primary">
            {title}
            <span className="ml-2 text-sm text-text-muted">
              {totalShown} / {library.length}
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <PileViewToggle groupBy={groupBy} pileView={pileView} onChange={setPileView} />
            {showShuffleOnClose && (
              <label className="flex items-center gap-1.5 text-xs text-text-muted select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleOnClose}
                  onChange={(e) => setShuffleOnClose(e.target.checked)}
                  className="accent-accent"
                />
                shuffle when closing
              </label>
            )}
            {/* The keyboard's way to the title bar's double-click. */}
            <button
              type="button"
              onClick={toggleExpanded}
              aria-pressed={expanded}
              aria-label={t('ZoneViewPanel.expand')}
              title={t('ZoneViewPanel.expand')}
              className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={() => onClose(showShuffleOnClose && shuffleOnClose)}
              className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
          {showSearchBar ? (
            <div className="relative flex-1 min-w-0">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                type="text"
                // Desktop's "Auto focus search bar when card view window is opened".
                autoFocus={focusSearchBar}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // The game's Esc (close the most recent view) skips text
                // inputs, so the search box closes its own view.
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onClose(showShuffleOnClose && shuffleOnClose);
                  }
                }}
                placeholder="Search — try t:creature, c:blue, cmc:3"
                className={[
                  'w-full pl-8 pr-3 py-2 rounded-md bg-bg-base border border-border-subtle text-sm',
                  'text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent',
                ].join(' ')}
              />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <ZoneViewSortControls groupBy={groupBy} sortBy={sortBy} onGroupByChange={setGroupBy} onSortByChange={setSortBy} />
        </div>

        {/* Grouped columns of stacked cards */}
        <div
          ref={contentRef}
          onPointerDown={onContentPointerDown}
          className="flex-1 min-h-0 overflow-auto p-4 relative"
        >
          {totalShown === 0 ? (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              No cards match the current filter.
            </div>
          ) : (
            <ZoneCardGroups
              groups={groups}
              pile={pile}
              renderCell={(c, g, place) => (
                <ZoneCardCell
                  card={c.handCard}
                  pile={place}
                  marked
                  cardOwner={cardOwner}
                  className="shrink-0"
                  selected={selectedIds.has(c.handCard.id)}
                  hidden={draggingCardIds?.has(c.handCard.id)}
                  onPointerDown={onCardPointerDown && ((e) => onCardPointerDown(e, c.handCard))}
                  onContextMenu={onCardContextMenu && ((e) => {
                    onCardContextMenu(e, c.handCard, { shownIds, columnIds: g.cards.map((gc) => gc.handCard.id) });
                  })}
                />
              )}
            />
          )}
        </div>
      </div>

      {/* Marquee rectangle for in-dialog selection. Fixed position so it
          stays aligned with the pointer regardless of the dialog's scroll. */}
      {marquee && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
            border: MARQUEE_BORDER,
            background: MARQUEE_FILL,
            zIndex: 1001,
          }}
        />
      )}
    </div>,
    document.body,
  );
}
