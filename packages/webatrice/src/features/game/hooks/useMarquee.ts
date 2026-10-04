import { useCallback, useEffect, useRef, useState } from 'react';

/** A marquee's band, in viewport coordinates. */
export interface MarqueeRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A marquee in progress: where it started and where the pointer is now. */
export interface Marquee<S> {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** What the caller recorded at the press, e.g. the zone it landed in. */
  start: S;
  /** How many cards the band selects right now. */
  count: number;
}

export interface UseMarqueeOptions {
  /** Block text selection on the page while the band is out. */
  blockTextSelection?: boolean;
}

/**
 * A rubber-band (marquee) selection. `begin` starts one at a press; while the
 * pointer moves, `select` picks the cards the band touches, live, so a card
 * highlights the moment the band covers it and clears the moment it doesn't,
 * and returns how many it picked. Releasing the pointer ends the band and
 * keeps the selection.
 */
export function useMarquee<S>(
  select: (rect: MarqueeRect, start: S) => number,
  { blockTextSelection = false }: UseMarqueeOptions = {},
) {
  const [marquee, setMarquee] = useState<Marquee<S> | null>(null);
  // The latest picker, so the window listeners need not re-bind when it changes.
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });

  useEffect(() => {
    if (!marquee) {
      return;
    }
    const onMove = (e: PointerEvent) => {
      const count = selectRef.current({
        left: Math.min(marquee.x1, e.clientX),
        right: Math.max(marquee.x1, e.clientX),
        top: Math.min(marquee.y1, e.clientY),
        bottom: Math.max(marquee.y1, e.clientY),
      }, marquee.start);
      setMarquee((m) => (m ? { ...m, x2: e.clientX, y2: e.clientY, count } : null));
    };
    const onUp = () => setMarquee(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [marquee]);

  // Keyed on whether a band is out, not on the band, so it doesn't re-run on every move.
  const active = marquee !== null;
  useEffect(() => {
    if (!blockTextSelection || !active) {
      return;
    }
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [blockTextSelection, active]);

  const begin = useCallback((point: { clientX: number; clientY: number }, start: S) => {
    setMarquee({ x1: point.clientX, y1: point.clientY, x2: point.clientX, y2: point.clientY, start, count: 0 });
  }, []);

  return { marquee, begin };
}
