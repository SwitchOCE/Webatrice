/**
 * Keyboard navigation over a list or grid of rows, shared by `useGridRows`
 * (roving focus) and the virtualized grids that keep focus on the grid and
 * point at the current row with aria-activedescendant.
 */

/** Rows PageUp/PageDown move by. */
export const GRID_PAGE_ROWS = 10;

/** The axis a list runs along: a column of rows, or a row of items (a hand of cards). */
export type ListOrientation = 'vertical' | 'horizontal';

/** The arrow keys that step forward and back along a list of `orientation`. */
export function listArrows(orientation: ListOrientation): { next: string; previous: string } {
  return orientation === 'horizontal'
    ? { next: 'ArrowRight', previous: 'ArrowLeft' }
    : { next: 'ArrowDown', previous: 'ArrowUp' };
}

/**
 * The row a navigation key moves to from `index` (the WAI-ARIA listbox/grid
 * keys), or null for any other key. With no current row, every key starts at
 * the first. A horizontal list steps with ← and → instead of ↑ and ↓.
 */
export function navigationTarget(
  key: string,
  index: number | null,
  count: number,
  orientation: ListOrientation = 'vertical',
): number | null {
  if (count === 0) {
    return null;
  }
  const last = count - 1;
  const from = index === null ? -1 : Math.min(index, last);
  const arrows = listArrows(orientation);
  switch (key) {
    case arrows.next: return Math.min(from + 1, last);
    case arrows.previous: return from < 0 ? 0 : Math.max(from - 1, 0);
    case 'Home': return 0;
    case 'End': return last;
    case 'PageDown': return Math.min(Math.max(from, 0) + GRID_PAGE_ROWS, last);
    case 'PageUp': return Math.max(from - GRID_PAGE_ROWS, 0);
    default: return null;
  }
}

/** Space or Enter: the keys that pick the focused row. */
export const isSelectKey = (key: string) => key === ' ' || key === 'Enter';
