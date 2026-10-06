import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

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
  /** Arrow keys, Home/End and Space select a row, like moving the current item in a Qt view. */
  onSelect: (key: string) => void;
  /** Enter (and a double-click, wired by the caller) opens a row. */
  onActivate: (key: string) => void;
  /** Tree grids: → expands a collapsed row. */
  onExpand?: (key: string) => void;
  /** Tree grids: ← collapses an expanded row, or moves to the parent of a child row. */
  onCollapse?: (key: string) => void;
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

/**
 * Keyboard model for selectable table rows (`role="grid"` / `"treegrid"`): one
 * roving tab stop on the selected row, ↑/↓/Home/End move the selection and the
 * focus with it, Space selects, Enter opens, and ←/→ collapse and expand tree
 * rows. Desktop's QTreeView/QListView give the same keys for free.
 */
export function useGridRows({ keys, selectedKey, onSelect, onActivate, onExpand, onCollapse }: GridRowsOptions) {
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

  const moveTo = useCallback((key: string | undefined) => {
    if (key != null) {
      onSelect(key);
      pendingFocus.current = key;
      setFocusRequest((n) => n + 1);
    }
  }, [onSelect]);

  const getRowProps = useCallback((key: string): GridRowProps => ({
    ref: (element) => {
      if (element) {
        elements.current.set(key, element);
        if (pendingFocus.current === key) {
          pendingFocus.current = null;
          element.focus();
        }
      } else {
        if (document.activeElement === elements.current.get(key) && pendingFocus.current == null) {
          pendingFocus.current = key;
        }
        elements.current.delete(key);
      }
    },
    tabIndex: key === tabStop ? 0 : -1,
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const index = keys.indexOf(key);
      switch (event.key) {
        case 'ArrowDown':
          moveTo(keys[index + 1]);
          break;
        case 'ArrowUp':
          moveTo(keys[index - 1]);
          break;
        case 'Home':
          moveTo(keys[0]);
          break;
        case 'End':
          moveTo(keys[keys.length - 1]);
          break;
        case ' ':
          onSelect(key);
          break;
        case 'Enter':
          onActivate(key);
          break;
        case 'ArrowRight':
          if (!onExpand) {
            return;
          }
          onExpand(key);
          break;
        case 'ArrowLeft':
          if (!onCollapse) {
            return;
          }
          onCollapse(key);
          break;
        default:
          return;
      }
      event.preventDefault();
    },
  }), [keys, tabStop, moveTo, onSelect, onActivate, onExpand, onCollapse]);

  return { getRowProps, focusRow: moveTo, onRowsRendered };
}
