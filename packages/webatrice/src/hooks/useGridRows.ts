import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { listArrows, navigationTarget, type ListOrientation } from './gridNavigation';

export interface GridRowsOptions {
  /** Keys of the rows currently rendered, in display order. */
  keys: readonly string[];
  /**
   * The selected row; it holds the single tab stop (the first row when nothing
   * is selected). In a virtualized list that reports its rendered range through
   * `onRowsRendered`, the first visible row holds it instead while that row is
   * scrolled out of the window, so Tab can always enter the grid.
   */
  selectedKey: string | null;
  /** Arrow keys, Home/End, PageUp/PageDown and Space select a row, like moving the current item in a Qt view. */
  onSelect: (key: string) => void;
  /** Enter (and a double-click, wired by the caller) opens a row. */
  onActivate: (key: string) => void;
  /** Tree grids: → expands a collapsed row. */
  onExpand?: (key: string) => void;
  /** Tree grids: ← collapses an expanded row, or moves to the parent of a child row. */
  onCollapse?: (key: string) => void;
  /** The arrows that walk the list: ↑/↓ for a column of rows (the default), ←/→ for a row of items. */
  orientation?: ListOrientation;
  /**
   * A two-dimensional layout: the keys split into lines that run along
   * `orientation` (a battlefield's rows, a card view's columns), in display
   * order. The arrows along the lines move within one; the other two move to
   * the nearest position in the next line that has any rows. Home, End and the
   * page keys stay inside the line.
   */
  lines?: readonly (readonly string[])[];
  /**
   * Multi-selection lists: Shift with a navigation key moves focus like the key
   * alone, but extends the selection to the row it lands on instead of
   * selecting only that row.
   */
  onExtend?: (key: string) => void;
  /**
   * Lists whose rows can leave while focused (a card played out of a hand):
   * focus moves on to the row that takes the removed row's place, or the one
   * before it at the end, instead of dropping to the page. A function also
   * says where focus goes when the last row leaves: it gets the removed row,
   * still in the document.
   */
  keepFocusOnRemoval?: boolean | ((removed: HTMLElement) => HTMLElement | null | undefined);
}

/** The window a virtualized list renders, as react-window's `onRowsRendered` reports it. */
export interface RenderedRows {
  startIndex: number;
  stopIndex: number;
}

export interface GridRowProps {
  ref: (element: HTMLElement | null) => void;
  tabIndex: number;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/** Where `key` sits in `lines`: its line and its position in that line. */
function locate(lines: readonly (readonly string[])[], key: string): { line: number; at: number } | null {
  for (let line = 0; line < lines.length; line++) {
    const at = lines[line].indexOf(key);
    if (at >= 0) {
      return { line, at };
    }
  }
  return null;
}

/**
 * The key a navigation key moves to in a two-dimensional layout, or null for a
 * key that doesn't navigate it.
 */
function lineTarget(
  lines: readonly (readonly string[])[],
  key: string,
  pressed: string,
  orientation: ListOrientation,
): string | null {
  const from = locate(lines, key);
  if (!from) {
    return null;
  }
  const line = lines[from.line];
  const along = navigationTarget(pressed, from.at, line.length, orientation);
  if (along !== null) {
    return line[along];
  }
  const across = listArrows(orientation === 'vertical' ? 'horizontal' : 'vertical');
  const step = pressed === across.next ? 1 : pressed === across.previous ? -1 : 0;
  if (step === 0) {
    return null;
  }
  for (let next = from.line + step; next >= 0 && next < lines.length; next += step) {
    if (lines[next].length > 0) {
      return lines[next][Math.min(from.at, lines[next].length - 1)];
    }
  }
  return key;
}

/**
 * Keyboard model for selectable table rows (`role="grid"` / `"treegrid"`): one
 * roving tab stop on the selected row, ↑/↓/Home/End/PageUp/PageDown move the
 * selection and the focus with it, Space selects, Enter opens, and ←/→
 * collapse and expand tree rows. Desktop's QTreeView/QListView give the same
 * keys for free. The same model serves a row of items (`orientation`), a
 * two-dimensional layout (`lines`) and a multi-selection (`onExtend`).
 */
export function useGridRows({
  keys,
  selectedKey,
  onSelect,
  onActivate,
  onExpand,
  onCollapse,
  orientation = 'vertical',
  lines,
  onExtend,
  keepFocusOnRemoval = false,
}: GridRowsOptions) {
  const elements = useRef(new Map<string, HTMLElement>());
  // The row a keyboard move is waiting to focus. In a virtualized list the
  // moved-to row may only mount after the caller scrolls it into view, so the
  // request stays pending until that row's element arrives.
  const pendingFocus = useRef<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  // Only virtualized callers report a rendered range; without one every row is mounted.
  const [rendered, setRendered] = useState<{ visibleStart: number; start: number; stop: number } | null>(null);
  const onRowsRendered = useCallback((visibleRows: RenderedRows, allRows: RenderedRows) => {
    setRendered((prev) =>
      prev?.visibleStart === visibleRows.startIndex && prev.start === allRows.startIndex && prev.stop === allRows.stopIndex
        ? prev
        : { visibleStart: visibleRows.startIndex, start: allRows.startIndex, stop: allRows.stopIndex });
  }, []);
  const preferred = selectedKey != null && keys.includes(selectedKey) ? selectedKey : keys[0] ?? null;
  const preferredIndex = preferred != null ? keys.indexOf(preferred) : -1;
  const preferredUnrendered = rendered != null && (preferredIndex < rendered.start || preferredIndex > rendered.stop);
  const tabStop = preferredUnrendered ? keys[rendered.visibleStart] ?? preferred : preferred;

  // Focus follows a keyboard move once the moved-to row is rendered.
  useEffect(() => {
    const key = pendingFocus.current;
    const element = key != null ? elements.current.get(key) : undefined;
    if (element) {
      pendingFocus.current = null;
      element.focus();
    }
    // A keyed row can move outside the rendered window after a live update.
    // Ask the caller to scroll that identity back into view before focusing it.
    if (key != null && !element) {
      if (keys.includes(key)) {
        onSelect(key);
      } else {
        pendingFocus.current = null;
      }
    }
  }, [focusRequest, keys, onSelect]);

  const requestFocus = useCallback((key: string) => {
    pendingFocus.current = key;
    setFocusRequest((n) => n + 1);
  }, []);

  // A focused row whose ref detached, and the rows that would take its place.
  // React detaches and reattaches every row's ref on a re-render too, so the
  // row only left if its element is out of the document once the commit is done,
  // and its key is gone (a key still listed only scrolled out of the window).
  const detachedFocus = useRef<{
    key: string;
    element: HTMLElement;
    successors: readonly string[];
    fallback: HTMLElement | null | undefined;
  } | null>(null);
  useLayoutEffect(() => {
    const detached = detachedFocus.current;
    detachedFocus.current = null;
    if (detached && !detached.element.isConnected && !keys.includes(detached.key)) {
      const successor = detached.successors.find((k) => elements.current.has(k));
      if (successor != null) {
        requestFocus(successor);
      } else if (detached.fallback?.isConnected) {
        detached.fallback.focus();
      }
    }
  });

  const moveTo = useCallback((key: string | undefined) => {
    if (key != null) {
      onSelect(key);
      requestFocus(key);
    }
  }, [onSelect, requestFocus]);

  const getRowProps = useCallback((key: string): GridRowProps => ({
    ref: (element) => {
      if (element) {
        elements.current.set(key, element);
        if (pendingFocus.current === key) {
          pendingFocus.current = null;
          element.focus();
        }
        return;
      }
      const removed = elements.current.get(key);
      elements.current.delete(key);
      // React detaches a removed row's ref before taking its element out of
      // the document, so it still holds focus here.
      if (removed == null || removed !== document.activeElement) {
        return;
      }
      if (pendingFocus.current == null) {
        pendingFocus.current = key;
      }
      if (keepFocusOnRemoval) {
        const index = keys.indexOf(key);
        detachedFocus.current = {
          key,
          element: removed,
          successors: [...keys.slice(index + 1), ...keys.slice(0, index).reverse()],
          fallback: typeof keepFocusOnRemoval === 'function' ? keepFocusOnRemoval(removed) : null,
        };
      }
    },
    tabIndex: key === tabStop ? 0 : -1,
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const index = keys.indexOf(key);
      const targetKey = lines
        ? lineTarget(lines, key, event.key, orientation)
        : (() => {
          const target = navigationTarget(event.key, index < 0 ? null : index, keys.length, orientation);
          return target === null ? null : keys[target];
        })();
      if (targetKey != null) {
        const extend = event.shiftKey && onExtend != null;
        // Home/End always select, like Qt's current-item moves; the arrows
        // and pages stop at either end.
        if (targetKey !== key || event.key === 'Home' || event.key === 'End') {
          if (extend) {
            onExtend(targetKey);
            requestFocus(targetKey);
          } else {
            moveTo(targetKey);
          }
        }
        event.preventDefault();
        return;
      }
      const tree = !lines && orientation === 'vertical';
      switch (event.key) {
        case ' ':
          onSelect(key);
          break;
        case 'Enter':
          onActivate(key);
          break;
        case 'ArrowRight':
          if (!tree || !onExpand) {
            return;
          }
          onExpand(key);
          break;
        case 'ArrowLeft':
          if (!tree || !onCollapse) {
            return;
          }
          onCollapse(key);
          break;
        default:
          return;
      }
      event.preventDefault();
    },
  }), [keys, tabStop, lines, orientation, keepFocusOnRemoval, moveTo, requestFocus, onSelect, onExtend, onActivate, onExpand, onCollapse]);

  return { getRowProps, focusRow: moveTo, onRowsRendered };
}
