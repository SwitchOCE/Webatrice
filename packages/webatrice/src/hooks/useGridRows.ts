import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface GridRowsOptions {
  /** Keys of the rows currently rendered, in display order. */
  keys: readonly string[];
  /** The selected row; it holds the single tab stop (the first row when nothing is selected). */
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
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const tabStop = selectedKey != null && keys.includes(selectedKey) ? selectedKey : keys[0] ?? null;

  // Focus follows a keyboard move once the moved-to row is rendered.
  useEffect(() => {
    if (focusKey != null) {
      elements.current.get(focusKey)?.focus();
      setFocusKey(null);
    }
  }, [focusKey]);

  const moveTo = useCallback((key: string | undefined) => {
    if (key != null) {
      onSelect(key);
      setFocusKey(key);
    }
  }, [onSelect]);

  const getRowProps = (key: string): GridRowProps => ({
    ref: (element) => {
      if (element) {
        elements.current.set(key, element);
      } else {
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
  });

  return { getRowProps, focusRow: moveTo };
}
