import { useEffect, useRef, useState } from 'react';

// Desktop's stroke timing (arrow_item.cpp): 0.8 ms per pixel of arrow, from 200 to 450 ms.
const MS_PER_PIXEL = 0.8;
const MIN_STROKE_MS = 200;
const MAX_STROKE_MS = 450;

/** How long desktop takes to draw an arrow of this length. */
export function arrowStrokeDurationMs(lengthPx: number): number {
  return Math.min(MAX_STROKE_MS, Math.max(MIN_STROKE_MS, lengthPx * MS_PER_PIXEL));
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * How much of a newly shown arrow is drawn, 0 to 1: desktop's "Arrow draw animation"
 * (ArrowItem::startDrawAnimation) reveals it from its start to its tip, easing out. An arrow
 * that mounts with the animation off, or once the reveal ends, is whole (1). The length is read
 * when the arrow appears; an arrow that moves while drawing keeps its timing.
 */
export function useArrowDrawIn(animate: boolean, lengthPx: number): number {
  const [progress, setProgress] = useState(animate ? 0 : 1);
  const durationMs = useRef(arrowStrokeDurationMs(lengthPx));
  const started = useRef(animate);

  useEffect(() => {
    if (!started.current) {
      return;
    }
    let frame = 0;
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / durationMs.current);
      setProgress(easeOutCubic(t));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return progress;
}

/**
 * Which of the drawn arrows arrived since the overlay last drew: desktop animates an arrow once,
 * when the game adds it (GameScene::addArrow). The arrows already in the game when the overlay is
 * first measured (joining a game in progress, a remount) count as seen, and so does every arrow
 * once drawn, so a re-measure or an endpoint that goes missing for a pass never draws one again.
 * An arrow that leaves the game is forgotten, so one created again with its id is new.
 */
export function useArrivingArrows(
  gameArrowKeys: ReadonlySet<string> | null,
  drawnKeys: readonly string[],
): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null && gameArrowKeys !== null) {
    seen.current = new Set(gameArrowKeys);
  }
  const arriving = new Set(seen.current ? drawnKeys.filter((key) => !seen.current!.has(key)) : []);

  useEffect(() => {
    if (!seen.current || !gameArrowKeys) {
      return;
    }
    for (const key of seen.current) {
      if (!gameArrowKeys.has(key)) {
        seen.current.delete(key);
      }
    }
    drawnKeys.forEach((key) => seen.current!.add(key));
  });

  return arriving;
}
