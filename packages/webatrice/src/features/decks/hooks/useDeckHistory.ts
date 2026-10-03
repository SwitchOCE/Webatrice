import { useCallback, useRef, useState } from 'react';

import {
  EMPTY_DECK_HISTORY,
  recordDeckEdit,
  redoDeck,
  undoDeck,
  type DeckHistory,
  type DeckHistoryReason,
} from '../deckHistory';
import type { HydratedDeck } from '../types';

export interface UseDeckHistory {
  history: DeckHistory;
  canUndo: boolean;
  canRedo: boolean;
  /** Save `before` as an undo entry (see `recordDeckEdit`). */
  record: (before: HydratedDeck, reason: DeckHistoryReason, coalesceMs?: number) => void;
  /** The deck after undoing `steps` entries, or `null` when there is nothing to undo. */
  undo: (current: HydratedDeck, steps?: number) => HydratedDeck | null;
  /** The deck after redoing `steps` entries, or `null` when there is nothing to redo. */
  redo: (current: HydratedDeck, steps?: number) => HydratedDeck | null;
  /** Drop every entry (a different deck was loaded). */
  clear: () => void;
}

/**
 * React owner of the editor's `DeckHistory`. A ref mirrors the state so
 * several edits inside one event each build on the previous one.
 */
export function useDeckHistory(now: () => number = Date.now): UseDeckHistory {
  const [history, setHistory] = useState<DeckHistory>(EMPTY_DECK_HISTORY);
  const historyRef = useRef(history);

  const commit = useCallback((next: DeckHistory) => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  const record = useCallback(
    (before: HydratedDeck, reason: DeckHistoryReason, coalesceMs?: number) => {
      commit(recordDeckEdit(historyRef.current, before, reason, { now: now(), coalesceMs }));
    },
    [commit, now],
  );

  const undo = useCallback(
    (current: HydratedDeck, steps = 1) => {
      const step = undoDeck(historyRef.current, current, steps);
      if (!step) {
        return null;
      }
      commit(step.history);
      return step.deck;
    },
    [commit],
  );

  const redo = useCallback(
    (current: HydratedDeck, steps = 1) => {
      const step = redoDeck(historyRef.current, current, steps);
      if (!step) {
        return null;
      }
      commit(step.history);
      return step.deck;
    },
    [commit],
  );

  const clear = useCallback(() => commit(EMPTY_DECK_HISTORY), [commit]);

  return {
    history,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    record,
    undo,
    redo,
    clear,
  };
}
