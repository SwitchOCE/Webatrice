import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export interface PanelPoint {
  x: number;
  y: number;
}

export interface PanelSize {
  w: number;
  h: number;
}

/** How much of a panel's header stays on screen when a stored position is restored. */
const HEADER_VISIBLE_PX = 60;

/** How long a panel waits after the last move or resize before it stores its geometry. */
const STORE_DELAY_MS = 500;

function readStored<K extends string>(key: string, fields: readonly K[]): Record<K, number> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && fields.every((f) => typeof parsed[f] === 'number' && Number.isFinite(parsed[f]))) {
      return Object.fromEntries(fields.map((f) => [f, parsed[f]])) as Record<K, number>;
    }
  } catch {
    // Unreadable: the panel opens at its default geometry.
  }
  return null;
}

function writeStored(key: string, value: PanelPoint | PanelSize): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage disabled or full: the geometry holds for this panel only.
  }
}

export function readStoredPosition(storageKey: string): PanelPoint | null {
  return readStored(`${storageKey}Position`, ['x', 'y']);
}

export function readStoredSize(storageKey: string): PanelSize | null {
  return readStored(`${storageKey}Size`, ['w', 'h']);
}

/** A size no smaller than the panel's minimum and no larger than the viewport, which wins. */
export function clampPanelSize(size: PanelSize, min: PanelSize): PanelSize {
  return {
    w: Math.min(Math.max(min.w, size.w), window.innerWidth),
    h: Math.min(Math.max(min.h, size.h), window.innerHeight),
  };
}

/** A position that keeps the panel's header reachable, for a viewport that shrank since it was stored. */
export function clampPanelPosition(pos: PanelPoint, size: PanelSize): PanelPoint {
  return {
    x: Math.max(HEADER_VISIBLE_PX - size.w, Math.min(window.innerWidth - HEADER_VISIBLE_PX, pos.x)),
    y: Math.max(0, Math.min(window.innerHeight - HEADER_VISIBLE_PX, pos.y)),
  };
}

export interface FloatingPanelGeometryOptions {
  /** The panel's storage key prefix: it stores `<storageKey>Position` and `<storageKey>Size`. */
  storageKey: string;
  minSize: PanelSize;
  /** The size a panel opens at with none stored: fixed, or set on the element by the caller. */
  initialSize: PanelSize | ((panel: HTMLDivElement) => void);
  /** Opens the panel again (size, then position) whenever it changes, e.g. a new reveal in an open panel. */
  openKey?: unknown;
}

/**
 * A floating, non-modal panel's geometry, as desktop's card views float over
 * the game: it opens at its stored size and position (else its initial size,
 * centred), moves by its header, and resizes by the browser's `resize` handle.
 * The size is written to the element rather than held in state, so the native
 * handle can change it freely; both are stored half a second after the user
 * last moved or resized the panel.
 */
export function useFloatingPanelGeometry({ storageKey, minSize, initialSize, openKey }: FloatingPanelGeometryOptions) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Null until the panel is measured on open: the flex parent centres it meanwhile.
  const [pos, setPos] = useState<PanelPoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<PanelPoint | null>(null);
  // Only a header drag stores the position: placing the panel on open does not.
  const hasBeenDragged = useRef(false);
  const initialSizeRef = useRef(initialSize);
  initialSizeRef.current = initialSize;

  // Size first, so the position below measures the size the panel opens at.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) {
      return;
    }
    const stored = readStoredSize(storageKey);
    const initial = initialSizeRef.current;
    if (stored) {
      const { w, h } = clampPanelSize(stored, minSize);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    } else if (typeof initial === 'function') {
      initial(el);
    } else {
      el.style.width = `${initial.w}px`;
      el.style.height = `${initial.h}px`;
    }
    // minSize is a constant per panel; openKey re-opens it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, openKey]);

  // Placed in a layout effect so the positioned panel paints on the frame the
  // centred one would have: no visible jump.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) {
      return;
    }
    hasBeenDragged.current = false;
    const rect = el.getBoundingClientRect();
    const stored = readStoredPosition(storageKey);
    setPos(stored
      ? clampPanelPosition(stored, { w: rect.width, h: rect.height })
      : {
        x: Math.max(0, (window.innerWidth - rect.width) / 2),
        y: Math.max(0, (window.innerHeight - rect.height) / 2),
      });
  }, [storageKey, openKey]);

  // The first observation is the size the panel opened at; any later one is the user resizing it.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) {
      return;
    }
    let first = true;
    let timer: number | null = null;
    const observer = new ResizeObserver(([entry]) => {
      if (first) {
        first = false;
        return;
      }
      const { width: w, height: h } = entry.contentRect;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => writeStored(`${storageKey}Size`, { w, h }), STORE_DELAY_MS);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [storageKey, openKey]);

  // Window listeners only while the header is held.
  useEffect(() => {
    if (!dragging) {
      return;
    }
    const onMove = (e: PointerEvent) => {
      const off = dragOffset.current;
      if (off) {
        setPos({ x: e.clientX - off.x, y: e.clientY - off.y });
      }
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

  useEffect(() => {
    if (!pos || !hasBeenDragged.current) {
      return;
    }
    const timer = window.setTimeout(() => writeStored(`${storageKey}Position`, pos), STORE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [storageKey, pos]);

  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // A header button (close, toggles) is not a grab.
    if (e.button !== 0 || (e.target as HTMLElement | null)?.closest('button')) {
      return;
    }
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPos({ x: rect.left, y: rect.top });
    setDragging(true);
    hasBeenDragged.current = true;
  };

  const panelStyle: CSSProperties = {
    minWidth: `${minSize.w}px`,
    minHeight: `${minSize.h}px`,
    ...(pos ? { position: 'absolute', left: pos.x, top: pos.y, margin: 0 } : null),
  };

  return { panelRef, panelStyle, dragging, onHeaderPointerDown };
}
