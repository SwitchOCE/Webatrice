import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';

import { ShortcutScope, useShortcut } from '@app/feature-widgets/shortcuts';
import { useGridRows, type GridRowProps } from '@app/hooks';
import type { DeckCategory } from '@app/types';

import type { DeckCard } from '../types';

/** Attribute that marks a card row and carries its key, so a shortcut can find the focused row. */
export const DECK_ROW_ATTRIBUTE = 'data-deck-row';

export interface DeckCardGridOptions {
  cards: readonly DeckCard[];
  /** Indices into `cards`, in the order the rows are drawn (top to bottom, column by column). */
  order: readonly number[];
  onInc: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
  /** Moves a row between main and sideboard (Shift+S). Omitted where rows have no sideboard. */
  onSetCategory?: (index: number, category: DeckCategory) => void;
}

export interface DeckCardRowProps extends GridRowProps {
  [DECK_ROW_ATTRIBUTE]: string;
  'aria-selected': boolean;
}

/** A row's identity across edits: its section and name (a deck can hold the same name in both). */
export function deckRowKey(card: DeckCard): string {
  return `${card.category}:${card.name}`;
}

/** The section a row moves to on Shift+S. A commander stays in the main deck, as its menu says. */
function swappedCategory(card: DeckCard): DeckCategory | null {
  if (card.category === 'sideboard') {
    return 'main';
  }
  return card.isCommander ? null : 'sideboard';
}

/**
 * Keyboard model of the deck editor's card list, after desktop's deck view
 * (`DeckEditorDeckDockWidget`): one tab stop on the current row, ↑/↓/Home/End
 * move it (`useGridRows`), and the current row takes desktop's edit keys —
 * Enter, Shift+→ and Ctrl+Alt+= add a copy, Shift+← and Ctrl+Alt+− remove
 * one, Delete removes the row, Shift+S swaps it between main and sideboard.
 * The rebindable `deck.addCard` / `deck.removeCard` shortcuts (+ / −) act on
 * the focused row too. Focus follows the row through edits that move or
 * remove it, so the keyboard never drops back to the page.
 */
export function useDeckCardGrid({ cards, order, onInc, onDelete, onSetCategory }: DeckCardGridOptions) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { keys, indexByKey } = useMemo(() => {
    const keys: string[] = [];
    const indexByKey = new Map<string, number>();
    for (const index of order) {
      const key = deckRowKey(cards[index]);
      keys.push(key);
      indexByKey.set(key, index);
    }
    return { keys, indexByKey };
  }, [cards, order]);

  const adjust = useCallback((key: string, delta: number) => {
    const index = indexByKey.get(key);
    if (index != null) {
      onInc(index, delta);
    }
  }, [indexByKey, onInc]);

  const { getRowProps, focusRow } = useGridRows({
    keys,
    selectedKey,
    onSelect: setSelectedKey,
    // Desktop: Enter on the deck view adds a copy (`actIncrementSelection`).
    onActivate: (key) => adjust(key, 1),
  });

  // The row about to disappear hands focus to its neighbour (the next row, else the previous).
  const remove = (key: string) => {
    const index = indexByKey.get(key);
    if (index == null) {
      return;
    }
    const position = keys.indexOf(key);
    const neighbour = keys[position + 1] ?? keys[position - 1];
    onDelete(index);
    if (neighbour != null) {
      focusRow(neighbour);
    }
  };

  const decrement = (key: string) => {
    const index = indexByKey.get(key);
    if (index != null && cards[index].quantity <= 1) {
      remove(key);
    } else {
      adjust(key, -1);
    }
  };

  const move = (index: number, category: DeckCategory) => {
    if (!onSetCategory) {
      return;
    }
    onSetCategory(index, category);
    // The row is redrawn under its new section; focus waits for it there.
    focusRow(deckRowKey({ ...cards[index], category }));
  };

  const swap = (key: string) => {
    const index = indexByKey.get(key);
    const category = index != null ? swappedCategory(cards[index]) : null;
    if (index != null && category != null) {
      move(index, category);
    }
  };

  const focusedKey = (): string | null =>
    (document.activeElement as HTMLElement | null)?.closest(`[${DECK_ROW_ATTRIBUTE}]`)?.getAttribute(DECK_ROW_ATTRIBUTE) ?? null;

  useShortcut('deck.addCard', () => {
    const key = focusedKey();
    if (key != null) {
      adjust(key, 1);
    }
  }, { scope: ShortcutScope.DECK_EDITOR, enabled: keys.length > 0 });
  useShortcut('deck.removeCard', () => {
    const key = focusedKey();
    if (key != null) {
      decrement(key);
    }
  }, { scope: ShortcutScope.DECK_EDITOR, enabled: keys.length > 0 });

  const getDeckRowProps = (index: number): DeckCardRowProps => {
    const key = deckRowKey(cards[index]);
    const row = getRowProps(key);
    return {
      ...row,
      [DECK_ROW_ATTRIBUTE]: key,
      'aria-selected': key === selectedKey,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
        const ctrlAlt = event.ctrlKey && event.altKey && !event.metaKey;
        if (plain && !event.shiftKey && event.key === 'Delete') {
          remove(key);
        } else if ((plain && event.shiftKey && event.key === 'ArrowRight') || (ctrlAlt && event.code === 'Equal')) {
          adjust(key, 1);
        } else if ((plain && event.shiftKey && event.key === 'ArrowLeft') || (ctrlAlt && event.code === 'Minus')) {
          decrement(key);
        } else if (plain && event.shiftKey && event.code === 'KeyS') {
          swap(key);
        } else {
          row.onKeyDown(event);
          return;
        }
        event.preventDefault();
      },
    };
  };

  return {
    getDeckRowProps,
    /** Remove the row at `index`, handing focus to its neighbour. */
    removeRow: (index: number) => remove(deckRowKey(cards[index])),
    /** Remove one copy at `index`; the last copy removes the row, as `removeRow` does. */
    decrementRow: (index: number) => decrement(deckRowKey(cards[index])),
    /** Move the row at `index` to `category`; focus follows it into its new section. */
    moveRow: move,
  };
}

export type DeckCardGrid = ReturnType<typeof useDeckCardGrid>;
