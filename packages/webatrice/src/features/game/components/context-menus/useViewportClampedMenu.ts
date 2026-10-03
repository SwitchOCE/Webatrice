import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Anchors a game menu at `(anchorX, anchorY)` and, once mounted, shifts it
 * back into the viewport if it would spill off the right/bottom/top/
 * left edges. Runs in `useLayoutEffect` so the correction applies
 * before paint — no visible flicker.
 *
 * Used by the card menu renderer (CardContextMenu) and the seat's zone
 * (library/graveyard/exile) menus so a right-click near the screen edge
 * doesn't clip the popup or its submenus.
 */
export function useViewportClampedMenu(anchorX: number, anchorY: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: anchorX, y: anchorY });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let x = anchorX;
    let y = anchorY;
    // Prefer flipping to the LEFT of the anchor when there's no room to
    // the right (matches how OS-native menus flip). Falls back to
    // clamping if flipping still overflows.
    if (x + rect.width > vw - margin) {
      x = Math.max(margin, anchorX - rect.width);
    }
    if (y + rect.height > vh - margin) {
      y = Math.max(margin, vh - rect.height - margin);
    }
    if (y < margin) {
      y = margin;
    }
    if (x < margin) {
      x = margin;
    }
    setPosition({ x, y });
  }, [anchorX, anchorY]);
  return { ref, position };
}
