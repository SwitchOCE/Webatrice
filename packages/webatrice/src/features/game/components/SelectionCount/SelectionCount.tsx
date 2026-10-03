import type { CSSProperties } from 'react';
import { usePreference } from '@app/hooks';

// Desktop's count labels (GameView): white bold monospace on translucent black.
const LABEL_CLASS = 'pointer-events-none select-none font-mono font-bold text-white bg-black/60 rounded-[3px] px-0.5 py-px';

/** Desktop's padding between the drag count and the band's edges. */
const LABEL_PADDING_PX = 4;
// The label's size for a count: 14px bold monospace digits plus padding. Used only to tell
// whether the band can hold it, as desktop hides the label rather than let it spill out.
const labelWidth = (count: number) => String(count).length * 9 + 4;
const LABEL_HEIGHT_PX = 20;

export interface MarqueeRect {
  x1: number;
  y1: number;
  /** The pointer's corner. */
  x2: number;
  y2: number;
}

/**
 * Where the drag count sits in the band (GameView::resizeRubberBand): inside it, in the corner
 * the pointer is dragging, clear of its edges; or nowhere when the band is too small to hold it.
 * Offsets are from the band's top-left corner.
 */
export function dragCountPlacement(band: MarqueeRect, count: number): Pick<CSSProperties, 'left' | 'right' | 'top' | 'bottom'> | null {
  const width = Math.abs(band.x2 - band.x1);
  const height = Math.abs(band.y2 - band.y1);
  if (width < labelWidth(count) + 2 * LABEL_PADDING_PX || height < LABEL_HEIGHT_PX + 2 * LABEL_PADDING_PX) {
    return null;
  }
  return {
    ...(band.x2 >= band.x1 ? { right: LABEL_PADDING_PX } : { left: LABEL_PADDING_PX }),
    ...(band.y2 >= band.y1 ? { bottom: LABEL_PADDING_PX } : { top: LABEL_PADDING_PX }),
  };
}

/**
 * "Show selection count during drag selection": how many cards the band selects, in the band's
 * pointer corner. Render inside the band's own box.
 */
export function DragSelectionCount({ band, count }: { band: MarqueeRect; count: number }) {
  const enabled = usePreference('showDragSelectionCount');
  const placement = enabled && count > 0 ? dragCountPlacement(band, count) : null;
  if (!placement) {
    return null;
  }
  return (
    <span data-testid="drag-selection-count" className={`absolute text-[14px] ${LABEL_CLASS}`} style={placement}>
      {count}
    </span>
  );
}
