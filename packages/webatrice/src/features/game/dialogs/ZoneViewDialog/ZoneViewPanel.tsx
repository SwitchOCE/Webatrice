import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { setRef } from '@mui/material/utils';
import { Search, X } from 'lucide-react';
import Card from '../../components/ui/SeatCard/SeatCard';
import { CARD_HEIGHT, CARD_WIDTH } from '../../components/ui/SeatCard/cardSize';
import { useCardPreviewActions } from '../../components/ui/CardPreviewContext';
import { usePreference } from '@app/hooks';
import { lookupCardsCached } from '@app/services';
import {
  compareCards,
  groupCards,
  matchesQuery,
  type EnrichedCard,
  type GroupMode,
  type SortMode,
  type ZoneViewCardMetadata,
} from './zoneViewSort';
import { readShuffleOnClose, writeShuffleOnClose } from './zoneViewPreferences';
import { cardViewRowsHeight, toggledCardViewHeight } from './cardViewHeight';
import { MARQUEE_BORDER, MARQUEE_FILL, SELECTED_RING } from '../../components/ui/seatColors/seatColors';

const TOOLBAR_SELECT_CLASS =
  'px-3 py-2 rounded-md bg-bg-base border border-border-subtle text-sm text-text-primary '
  + 'focus:outline-none focus:border-accent';

type HandCard = { id: string; name: string; scryfallId: string };

/** localStorage keys for the dialog's persisted UI state. Cockatrice
 *  desktop persists these via SettingsCache (view_zone_widget.cpp:161-163);
 *  we mirror the behavior in browser localStorage. */
const POSITION_STORAGE_KEY = 'webatrice.searchLibraryPosition';
const SIZE_STORAGE_KEY = 'webatrice.searchLibrarySize';
const SORT_BY_STORAGE_KEY = 'webatrice.searchLibrarySortBy';
const GROUP_BY_STORAGE_KEY = 'webatrice.searchLibraryGroupBy';
const PILE_VIEW_STORAGE_KEY = 'webatrice.searchLibraryPileView';

const MIN_DIALOG_W = 400;
const MIN_DIALOG_H = 300;
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

function readStoredPosition(): { x: number; y: number } | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // ignore parse errors — fall back to centered layout
  }
  return null;
}

function writeStoredPosition(pos: { x: number; y: number }): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // ignore quota / disabled storage errors — the dialog still works
  }
}

function readStoredSize(): { w: number; h: number } | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.w === 'number' &&
      typeof parsed.h === 'number' &&
      Number.isFinite(parsed.w) &&
      Number.isFinite(parsed.h)
    ) {
      return { w: parsed.w, h: parsed.h };
    }
  } catch {
    // ignore
  }
  return null;
}

function writeStoredSize(size: { w: number; h: number }): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // ignore
  }
}

function clampSizeToViewport(size: { w: number; h: number }): {
  w: number;
  h: number;
} {
  return {
    w: Math.max(MIN_DIALOG_W, Math.min(window.innerWidth, size.w)),
    h: Math.max(MIN_DIALOG_H, Math.min(window.innerHeight, size.h)),
  };
}

/** Clamp a position so the dialog's header stays reachable on screen —
 *  handy when the viewport shrinks between sessions. */
function clampToViewport(
  pos: { x: number; y: number },
  size: { w: number; h: number },
): { x: number; y: number } {
  const minVisible = 60; // keep at least 60px of the header visible
  const maxX = window.innerWidth - minVisible;
  const maxY = window.innerHeight - minVisible;
  const minX = minVisible - size.w;
  return {
    x: Math.max(minX, Math.min(maxX, pos.x)),
    y: Math.max(0, Math.min(maxY, pos.y)),
  };
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
};

/** Metadata for a name the catalog hasn't answered for (yet): sorts and
 *  groups as unknown ("Other", mana value 0). */
function placeholderMeta(name: string): ZoneViewCardMetadata {
  return { name, type_line: null, cmc: null, colors: [], set: null, power: null, toughness: null };
}

/** Amount of vertical space each card takes in a pile — enough to show the
 *  title pill on top. Last card in a pile still renders fully. */
const PILE_STEP_FRACTION = 0.25;

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
}: Props) {
  const { setHoveredCard, openBigPreview, closeBigPreview } = useCardPreviewActions();
  const [query, setQuery] = useState('');
  const focusSearchBar = usePreference('focusCardViewSearchBar');
  const cardViewInitialRowsMax = usePreference('cardViewInitialRowsMax');
  const cardViewExpandedRowsMax = usePreference('cardViewExpandedRowsMax');
  // Desktop hides the search box while "Keep game chat focused" is on: typing goes to the chat.
  const showSearchBar = !usePreference('keepGameChatFocus');
  const activeQuery = showSearchBar ? query : '';
  // Grouping/sorting defaults match Cockatrice's SettingsCache
  // (cache_settings.cpp:383-384): `zoneview/groupby` defaults to index 1
  // (By Type) and `zoneview/sortby` defaults to index 1 (By Name).
  // Persisted across sessions like desktop's SettingsCache-backed
  // settings, keyed off the option string rather than the index.
  const [groupBy, setGroupBy] = useState<GroupMode>(() => {
    if (typeof window === 'undefined') {
      return 'type';
    }
    try {
      const raw = window.localStorage.getItem(GROUP_BY_STORAGE_KEY);
      if (
        raw === 'none' ||
        raw === 'type' ||
        raw === 'cmc' ||
        raw === 'color'
      ) {
        return raw;
      }
    } catch {
      // ignore
    }
    return 'type';
  });
  const [sortBy, setSortBy] = useState<SortMode>(() => {
    if (typeof window === 'undefined') {
      return 'name';
    }
    try {
      const raw = window.localStorage.getItem(SORT_BY_STORAGE_KEY);
      if (
        raw === 'none' ||
        raw === 'name' ||
        raw === 'cmc' ||
        raw === 'type' ||
        raw === 'color' ||
        raw === 'set' ||
        raw === 'pt'
      ) {
        return raw;
      }
    } catch {
      // ignore
    }
    return 'name';
  });
  // Pile view: stacks cards within each group into a fan. Only
  // meaningful when grouped — Cockatrice disables the checkbox when
  // grouping is off (view_zone_widget.cpp:197). Default ON so a
  // 90+ card library fits without endless vertical scrolling.
  const [pileView, setPileView] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    try {
      const raw = window.localStorage.getItem(PILE_VIEW_STORAGE_KEY);
      if (raw === null) {
        return true;
      }
      return raw === '1';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(GROUP_BY_STORAGE_KEY, groupBy);
    } catch {
      // ignore
    }
  }, [groupBy]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(SORT_BY_STORAGE_KEY, sortBy);
    } catch {
      // ignore
    }
  }, [sortBy]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(PILE_VIEW_STORAGE_KEY, pileView ? '1' : '0');
    } catch {
      // ignore
    }
  }, [pileView]);
  // "Shuffle when closing" toggle. Cockatrice's ZoneViewWidget
  // defaults this to on; unchecking lets the player peek at library
  // order without wrecking the game state. Persist across sessions.
  const [shuffleOnClose, setShuffleOnClose] = useState(readShuffleOnClose);
  useEffect(() => {
    writeShuffleOnClose(shuffleOnClose);
  }, [shuffleOnClose]);

  // Drag-to-move state. `pos` is the current top-left of the dialog in
  // viewport coords; while it's null, the dialog falls back to being
  // centered by the flex parent (used on first open before we've
  // measured its size).
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  // Only true after the user has actively grabbed the header at least
  // once. Gates the debounced save so opening the dialog (which sets
  // `pos` via useLayoutEffect from either storage or the centered
  // fallback) doesn't trigger a redundant no-op write.
  const hasBeenDraggedRef = useRef(false);

  // Apply the saved size on open (before measuring for position) so the
  // position calc uses the final rendered size. Written imperatively so
  // the browser's native `resize: both` handle can freely modify the
  // inline width/height without racing React state.
  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el) {
      return;
    }
    const storedSize = readStoredSize();
    if (storedSize) {
      const clamped = clampSizeToViewport(storedSize);
      el.style.width = `${clamped.w}px`;
      el.style.height = `${clamped.h}px`;
    } else if (contentRef.current) {
      // Desktop's "Maximum initial height for card view window", in rows. A size the user set
      // by hand, stored above, wins.
      const { chrome, cardHeightPx } = measureCardView(el, contentRef.current);
      // As on desktop, no taller than the cards need (unknown, 0, before layout).
      const cardsHeight = contentsHeight(contentRef.current);
      const rowsHeight = cardViewRowsHeight(cardViewInitialRowsMax, cardHeightPx);
      const height = chrome + (cardsHeight > 0 ? Math.min(rowsHeight, cardsHeight) : rowsHeight);
      el.style.height = `${Math.round(clampSizeToViewport({ w: el.getBoundingClientRect().width, h: height }).h)}px`;
    }
    // Read once, at open, as desktop sizes a new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const next = toggledCardViewHeight(area, {
      initial: cardViewRowsHeight(cardViewInitialRowsMax, cardHeightPx),
      expanded: cardViewRowsHeight(Math.max(cardViewExpandedRowsMax, cardViewInitialRowsMax), cardHeightPx),
      maxHeight: Math.min(window.innerHeight - chrome, cardsHeight > 0 ? cardsHeight : Infinity),
    });
    el.style.height = `${Math.round(Math.max(MIN_DIALOG_H, chrome + next))}px`;
  };

  // Position the dialog whenever it opens. Prefer a saved position from
  // a previous session (so the dialog reappears where the user last put
  // it); otherwise center it. Runs in useLayoutEffect so the paint of
  // the explicitly-positioned dialog lands on the same frame as the
  // flex-centered fallback — no visible jump.
  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const stored = readStoredPosition();
    if (stored) {
      setPos(
        clampToViewport(stored, { w: rect.width, h: rect.height }),
      );
    } else {
      setPos({
        x: Math.max(0, (window.innerWidth - rect.width) / 2),
        y: Math.max(0, (window.innerHeight - rect.height) / 2),
      });
    }
  }, []);

  // Watch dialog size changes and persist them after 500ms of no change.
  // The first ResizeObserver fire is skipped — it reports the initial
  // size (from storage or CSS default), which the user hasn't actively
  // set. Any subsequent fire means the user grabbed the resize handle.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) {
      return;
    }
    let first = true;
    let timer: number | null = null;
    const ro = new ResizeObserver(([entry]) => {
      if (first) {
        first = false;
        return;
      }
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        writeStoredSize({ w, h });
      }, 500);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  // Global pointer listeners while the user is dragging the header.
  // Registered only during a drag; released on pointerup.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) {
      return;
    }
    const onMove = (e: PointerEvent) => {
      const off = dragOffset.current;
      if (!off) {
        return;
      }
      setPos({ x: e.clientX - off.x, y: e.clientY - off.y });
    };
    const onUp = () => {
      dragOffset.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging]);

  // Persist the position 500ms after the last move so we don't hit
  // localStorage on every pointermove. Each new `pos` value resets the
  // timer; once the user leaves the dialog alone for half a second, the
  // final position is written. Gated on hasBeenDraggedRef so the
  // useLayoutEffect that positions the dialog on open doesn't also
  // trigger a redundant save.
  useEffect(() => {
    if (!pos || !hasBeenDraggedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      writeStoredPosition(pos);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [pos]);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    // Don't start a drag from the close button (or any other button we
    // might add to the header later).
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) {
      return;
    }
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPos({ x: rect.left, y: rect.top });
    setDragging(true);
    hasBeenDraggedRef.current = true;
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

  // Card metadata (type line, mana value, colours, P/T) from the card
  // catalog, keyed by name: dumps routinely leave provider_id empty, and
  // the display fields are stable across printings. Mirrors
  // IncomingRevealDialog: names already looked up skip the round trip.
  const [metaByName, setMetaByName] = useState<Map<string, ZoneViewCardMetadata>>(
    () => new Map(),
  );
  const uniqueNames = useMemo(
    () => new Set(library.map((c) => c.name).filter((n) => n.length > 0)),
    [library],
  );
  useEffect(() => {
    const needsLookup = Array.from(uniqueNames).filter((name) => !metaByName.has(name));
    if (needsLookup.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const results = await lookupCardsCached(needsLookup);
      if (cancelled) {
        return;
      }
      setMetaByName((prev) => {
        const next = new Map(prev);
        for (const [name, r] of results) {
          next.set(name, {
            name,
            type_line: r.typeLine ?? null,
            cmc: r.cmc ?? null,
            colors: r.colors ?? [],
            set: r.printings[0]?.set ?? null,
            power: r.power ?? null,
            toughness: r.toughness ?? null,
          });
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqueNames, metaByName]);

  // Every unique name must have its metadata before Group by Type / Sort
  // by Type / etc. run. Otherwise a card with real metadata racing one
  // still loading would briefly be the only thing outside "Other".
  const metadataLoaded = Array.from(uniqueNames).every((name) => metaByName.has(name));
  const effectiveGroupBy: GroupMode = metadataLoaded ? groupBy : 'none';
  const effectiveSortBy: SortMode = metadataLoaded ? sortBy : 'none';

  const groups = useMemo(() => {
    const enriched: EnrichedCard[] = [];
    for (const hc of library) {
      const meta = metaByName.get(hc.name) ?? placeholderMeta(hc.name);
      if (!matchesQuery(meta, activeQuery)) {
        continue;
      }
      enriched.push({ handCard: hc, meta });
    }
    enriched.sort((a, b) => compareCards(a.meta, b.meta, effectiveSortBy));
    return groupCards(enriched, effectiveGroupBy);
  }, [library, metaByName, activeQuery, effectiveSortBy, effectiveGroupBy]);

  const totalShown = groups.reduce((n, g) => n + g.cards.length, 0);
  const shownIds = groups.flatMap((g) => g.cards.map((c) => c.handCard.id));

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
        //
        // When `pos` is set, we position the dialog absolutely at that
        // point so the user can freely drag it around the play area.
        // While `pos` is null (before the layout effect fires), the flex
        // parent centers it — no visible jump.
        style={
          {
            '--card-width': '9rem',
            '--card-height': `${CARD_VIEW_CARD_HEIGHT_REM}rem`,
            minWidth: `${MIN_DIALOG_W}px`,
            minHeight: `${MIN_DIALOG_H}px`,
            ...(pos
              ? { position: 'absolute', left: pos.x, top: pos.y, margin: 0 }
              : null),
          } as React.CSSProperties
        }
      >
        {/* Header */}
        <div
          onPointerDown={onHeaderPointerDown}
          onDoubleClick={toggleExpanded}
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
            <label
              className={[
                'flex items-center gap-1.5 text-xs select-none',
                groupBy === 'none'
                  ? 'text-text-disabled cursor-not-allowed'
                  : 'text-text-muted cursor-pointer',
              ].join(' ')}
              title={
                groupBy === 'none'
                  ? 'Pile view requires a grouping'
                  : 'Stack cards within each group'
              }
            >
              <input
                type="checkbox"
                checked={pileView && groupBy !== 'none'}
                disabled={groupBy === 'none'}
                onChange={(e) => setPileView(e.target.checked)}
                className="accent-accent"
              />
              pile view
            </label>
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
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupMode)}
            className={TOOLBAR_SELECT_CLASS}
            title="Group by"
          >
            <option value="none">Ungrouped</option>
            <option value="type">Group by Type</option>
            <option value="cmc">Group by Mana Value</option>
            <option value="color">Group by Color</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortMode)}
            className={TOOLBAR_SELECT_CLASS}
            title="Sort by"
          >
            <option value="none">Unsorted</option>
            <option value="name">Sort by Name</option>
            <option value="cmc">Sort by Mana Cost</option>
            <option value="type">Sort by Type</option>
            <option value="color">Sort by Color</option>
            <option value="set">Sort by Set</option>
            <option value="pt">Sort by P/T</option>
          </select>
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
            // Two layouts: pile-view stacks cards vertically per group
            // (one column per group), flat-view lays them out in a wrapping
            // grid within each group. Cockatrice's pile-view checkbox
            // toggles between these (view_zone_widget.cpp:64 + 197).
            <div className={pileView && groupBy !== 'none' ? 'flex gap-3 items-start' : 'flex flex-col gap-6'}>
              {groups.map((g) => (
                <div
                  key={g.key}
                  className={pileView && groupBy !== 'none' ? 'shrink-0' : ''}
                  style={pileView && groupBy !== 'none' ? { width: CARD_WIDTH } : undefined}
                >
                  {/* Group label — hidden when ungrouped ("all"/"" key). */}
                  {g.label && (
                    <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5 select-none">
                      {g.label} <span className="text-text-muted normal-case">({g.cards.length})</span>
                    </div>
                  )}
                  {pileView && groupBy !== 'none' ? (
                    <div
                      className="relative"
                      style={{
                        width: CARD_WIDTH,
                        // Each card except the last takes PILE_STEP; the last
                        // one shows fully.
                        height: `calc(${CARD_HEIGHT} + ${Math.max(
                          0,
                          g.cards.length - 1,
                        )} * calc(${CARD_HEIGHT} * ${PILE_STEP_FRACTION}))`,
                      }}
                    >
                      {g.cards.map((c, i) => {
                        const selected = selectedIds.has(c.handCard.id);
                        const dragging = draggingCardIds?.has(c.handCard.id);
                        const isLast = i === g.cards.length - 1;
                        // Outer wrapper's DOM box = the visible strip only
                        // (last card gets full height since it shows fully).
                        // The Card inside is absolutely positioned at full
                        // size with pointer-events:none, so it visually
                        // overflows the strip but the browser's hover
                        // detection stays confined to the strip's bounds —
                        // moving off the strip cleanly hands off to the
                        // next card's strip below. `group` + `group-hover`
                        // apply the scale to the inner visual container
                        // when the outer strip is hovered.
                        return (
                          <div
                            key={c.handCard.id}
                            data-card
                            data-card-id={c.handCard.id}
                            className="absolute left-0 hover:z-10 group"
                            onPointerDown={(e) => {
                              if (e.button !== 0) {
                                return;
                              }
                              onCardPointerDown?.(e, c.handCard);
                            }}
                            onContextMenu={
                              onCardContextMenu
                                ? (e) => {
                                  e.preventDefault();
                                  onCardContextMenu(e, c.handCard, { shownIds, columnIds: g.cards.map((gc) => gc.handCard.id) });
                                }
                                : undefined
                            }
                            onMouseEnter={() => {
                              // Right-rail preview picks up the hovered card
                              // (same as normal Card hover). Handled here
                              // because the inner Card is pointer-events:
                              // none and never receives its own mouseenter.
                              setHoveredCard({
                                name: c.handCard.name,
                                scryfallId: c.handCard.scryfallId,
                              });
                            }}
                            onMouseDown={(e) => {
                              // Middle-click zoom parity with Card.tsx —
                              // held down = show big preview, release =
                              // dismiss. Same reason as the mouseEnter
                              // above: Card can't receive this itself.
                              if (e.button !== 1) {
                                return;
                              }
                              e.preventDefault();
                              openBigPreview({
                                name: c.handCard.name,
                                scryfallId: c.handCard.scryfallId,
                              });
                              const handleUp = (ev: MouseEvent) => {
                                if (ev.button !== 1) {
                                  return;
                                }
                                closeBigPreview();
                                window.removeEventListener('mouseup', handleUp);
                              };
                              window.addEventListener('mouseup', handleUp);
                            }}
                            onAuxClick={(e) => {
                              if (e.button === 1) {
                                e.preventDefault();
                              }
                            }}
                            style={{
                              top: `calc(${CARD_HEIGHT} * ${PILE_STEP_FRACTION} * ${i})`,
                              width: CARD_WIDTH,
                              height: isLast
                                ? CARD_HEIGHT
                                : `calc(${CARD_HEIGHT} * ${PILE_STEP_FRACTION})`,
                              borderRadius: '7.5%',
                              boxShadow: selected
                                ? SELECTED_RING
                                : undefined,
                              opacity: dragging ? 0 : 1,
                              touchAction: onCardPointerDown ? 'none' : undefined,
                              cursor: onCardPointerDown ? 'grab' : undefined,
                            }}
                          >
                            <div
                              className={[
                                'absolute left-0 top-0 pointer-events-none',
                                'transition-transform duration-150 ease-out group-hover:scale-[1.06]',
                              ].join(' ')}
                              style={{
                                width: CARD_WIDTH,
                                height: CARD_HEIGHT,
                              }}
                            >
                              <Card
                                name={c.handCard.name}
                                scryfallId={c.handCard.scryfallId}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Flat layout: cards wrap in a grid within the group.
                    <div className="flex flex-wrap gap-2">
                      {g.cards.map((c) => {
                        const selected = selectedIds.has(c.handCard.id);
                        const dragging = draggingCardIds?.has(c.handCard.id);
                        return (
                          <div
                            key={c.handCard.id}
                            data-card
                            data-card-id={c.handCard.id}
                            className="shrink-0"
                            onPointerDown={(e) => {
                              if (e.button !== 0) {
                                return;
                              }
                              onCardPointerDown?.(e, c.handCard);
                            }}
                            onContextMenu={
                              onCardContextMenu
                                ? (e) => {
                                  e.preventDefault();
                                  onCardContextMenu(e, c.handCard, { shownIds, columnIds: g.cards.map((gc) => gc.handCard.id) });
                                }
                                : undefined
                            }
                            style={{
                              width: CARD_WIDTH,
                              height: CARD_HEIGHT,
                              borderRadius: '7.5%',
                              boxShadow: selected
                                ? SELECTED_RING
                                : undefined,
                              opacity: dragging ? 0 : 1,
                              touchAction: onCardPointerDown ? 'none' : undefined,
                              cursor: onCardPointerDown ? 'grab' : undefined,
                            }}
                          >
                            <Card
                              name={c.handCard.name}
                              scryfallId={c.handCard.scryfallId}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
