import { useCallback, useRef, useState, type KeyboardEvent } from 'react';

/** Rows PageUp/PageDown move by. */
const PAGE = 10;

/**
 * The row a navigation key moves to from `index` (the WAI-ARIA listbox/grid
 * keys), or null for any other key. With no current row, every key starts at
 * the first.
 */
export function navigationTarget(key: string, index: number | null, count: number): number | null {
  if (count === 0) {
    return null;
  }
  const last = count - 1;
  const from = index === null ? -1 : Math.min(index, last);
  switch (key) {
    case 'ArrowDown': return Math.min(from + 1, last);
    case 'ArrowUp': return from < 0 ? 0 : Math.max(from - 1, 0);
    case 'Home': return 0;
    case 'End': return last;
    case 'PageDown': return Math.min(Math.max(from, 0) + PAGE, last);
    case 'PageUp': return Math.max(from - PAGE, 0);
    default: return null;
  }
}

/** Space or Enter: the keys that pick the focused row. */
export const isSelectKey = (key: string) => key === ' ' || key === 'Enter';

export interface RovingOptionProps {
  tabIndex: number;
  ref: (element: HTMLElement | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
}

/**
 * Roving tabindex for a short single-select listbox: one option is in the tab
 * order, arrows move focus between options, Space or Enter selects the focused
 * one (a click selects as before).
 */
export function useRovingOptions(count: number, selectedIndex: number | null, onSelect: (index: number) => void) {
  const [focused, setFocused] = useState<number | null>(null);
  const elements = useRef<Array<HTMLElement | null>>([]);
  const current = focused !== null && focused < count ? focused : selectedIndex;
  const tabStop = current ?? 0;

  const optionProps = useCallback((index: number): RovingOptionProps => ({
    tabIndex: index === tabStop ? 0 : -1,
    ref: (element) => {
      elements.current[index] = element;
    },
    onFocus: () => setFocused(index),
    onKeyDown: (event) => {
      if (isSelectKey(event.key)) {
        event.preventDefault();
        onSelect(index);
        return;
      }
      const target = navigationTarget(event.key, index, count);
      if (target !== null) {
        event.preventDefault();
        elements.current[target]?.focus();
      }
    },
  }), [count, onSelect, tabStop]);

  return { optionProps };
}
