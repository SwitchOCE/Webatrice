import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { SignalTone } from '../../bracketBadges';

/**
 * Signal badge with a portal-rendered hover tooltip listing the cards
 * that contributed to the count. Ports fancy webatrice's `CountBadge`.
 *
 * Design notes:
 *   • Tooltip is portal-mounted so it can escape any `overflow: hidden`
 *     ancestors (the deck-breakdown lives inside the editor's scroll
 *     container).
 *   • 120ms grace period on mouse-leave so the user can move the
 *     cursor into the tooltip to scroll long lists.
 *   • Flip above / below based on available viewport space so it
 *     doesn't get cropped at the page edge.
 */
export function SignalBadge({
  label,
  count,
  tone,
  items,
}: {
  label: string;
  count: number;
  tone: SignalTone;
  items: string[];
}) {
  const toneClass =
    tone === 'hot'
      ? 'text-danger bg-red-500/10 border-red-500/30'
      : tone === 'warn'
        ? 'text-warning bg-yellow-500/10 border-yellow-500/30'
        : 'text-text-secondary bg-bg-elevated border-border-subtle';

  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canHover = items.length > 0;

  const show = () => {
    if (!canHover || !ref.current) {
      return;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setRect(ref.current.getBoundingClientRect());
  };
  const scheduleHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => setRect(null), 120);
  };

  useEffect(() => {
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, []);

  // Pick the side with more vertical room — 220px is roughly enough
  // for ~10 items before the user needs to scroll inside the tooltip.
  const TOOLTIP_WIDTH = 260;
  const layout = rect
    ? (() => {
      const EDGE = 8;
      const GAP = 6;
      const spaceBelow = window.innerHeight - rect.bottom - EDGE;
      const spaceAbove = rect.top - EDGE;
      const showBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
      const maxHeight = Math.min(
        560,
        showBelow ? spaceBelow - GAP : spaceAbove - GAP,
      );
      return {
        left: Math.max(
          EDGE,
          Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - EDGE),
        ),
        top: showBelow ? rect.bottom + GAP : undefined,
        bottom: showBelow ? undefined : window.innerHeight - rect.top + GAP,
        maxHeight,
      };
    })()
    : null;

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        className={`px-2.5 py-1.5 rounded-md border text-xs ${toneClass} ${canHover ? 'cursor-help' : ''}`}
      >
        <div className="uppercase tracking-wider text-[10px] opacity-70">{label}</div>
        <div className="font-semibold tabular-nums text-sm">{count}</div>
      </div>
      {rect && layout &&
        createPortal(
          <div
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            className="fixed z-[60] rounded-lg bg-bg-surface border border-border-subtle shadow-glow py-2 px-3 flex flex-col"
            style={{
              left: layout.left,
              top: layout.top,
              bottom: layout.bottom,
              width: TOOLTIP_WIDTH,
              maxHeight: layout.maxHeight,
            }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1.5 shrink-0">
              {label}
            </div>
            <ul className="space-y-0.5 text-xs text-text-primary overflow-y-auto pr-1">
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
