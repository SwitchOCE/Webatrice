import type { DeckCategory } from '@app/types';

import type { HydratedDeck } from './types';

/**
 * Undo/redo history for the deck editor, mirroring desktop's
 * `DeckListHistoryManager`: each user edit saves a named memento of the
 * deck as it was *before* the edit; undo and redo move mementos between
 * the two stacks, saving the current deck on the opposite stack under the
 * moved entry's reason so the step can be reversed.
 *
 * Pure: every function returns a new history. Derived caches the editor
 * writes on its own (price, bracket estimate) are not edits and are never
 * recorded.
 */

/** Why an entry exists. Rendered through `DeckHistory.reason.<kind>`. */
export type DeckHistoryReason =
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'description'; before: number; after: number }
  | { kind: 'format'; format: string }
  | { kind: 'banner'; name: string }
  | { kind: 'bannerCleared' }
  | { kind: 'tags' }
  | { kind: 'addCard'; zone: DeckCategory; name: string }
  | { kind: 'adjustCard'; delta: number; name: string }
  | { kind: 'removeCard'; name: string }
  | { kind: 'moveCard'; count: number; name: string; zone: DeckCategory }
  | { kind: 'setCommander'; name: string }
  | { kind: 'unsetCommander'; name: string }
  | { kind: 'changePrinting'; name: string; set: string };

export interface DeckMemento {
  deck: HydratedDeck;
  reason: DeckHistoryReason;
  /** When the entry was recorded (ms); only used to merge typing bursts. */
  at: number;
}

export interface DeckHistory {
  /** Oldest first; the last entry is the next undo. */
  undo: readonly DeckMemento[];
  /** Oldest first; the last entry is the next redo. */
  redo: readonly DeckMemento[];
}

export const EMPTY_DECK_HISTORY: DeckHistory = { undo: [], redo: [] };

/** Bound on undo depth so a long session can't hold unbounded deck copies. */
export const DECK_HISTORY_LIMIT = 100;

/**
 * Desktop debounces typing before it saves a memento (deck name 300 ms,
 * comments 400 ms), so one burst of typing is one history entry. A
 * same-kind edit within this window of the newest entry merges into it.
 */
export const RENAME_COALESCE_MS = 300;
export const DESCRIPTION_COALESCE_MS = 400;

export interface RecordOptions {
  now: number;
  /** Merge into the newest entry when it has the same kind and is this recent. */
  coalesceMs?: number;
}

/** Save `before` (the deck prior to an edit) as a new undo entry; clears redo. */
export function recordDeckEdit(
  history: DeckHistory,
  before: HydratedDeck,
  reason: DeckHistoryReason,
  { now, coalesceMs }: RecordOptions,
): DeckHistory {
  const newest = history.undo[history.undo.length - 1];
  if (
    coalesceMs != null
    && newest
    && history.redo.length === 0
    && newest.reason.kind === reason.kind
    && now - newest.at <= coalesceMs
  ) {
    const merged: DeckMemento = { deck: newest.deck, reason: mergeReasons(newest.reason, reason), at: now };
    return { undo: [...history.undo.slice(0, -1), merged], redo: [] };
  }
  const undo = [...history.undo, { deck: before, reason, at: now }];
  return { undo: undo.slice(Math.max(0, undo.length - DECK_HISTORY_LIMIT)), redo: [] };
}

/** A merged burst keeps the oldest starting point and the newest result. */
function mergeReasons(older: DeckHistoryReason, newer: DeckHistoryReason): DeckHistoryReason {
  if (older.kind === 'rename' && newer.kind === 'rename') {
    return { kind: 'rename', from: older.from, to: newer.to };
  }
  if (older.kind === 'description' && newer.kind === 'description') {
    return { kind: 'description', before: older.before, after: newer.after };
  }
  return newer;
}

export interface HistoryStep {
  history: DeckHistory;
  deck: HydratedDeck;
}

/**
 * Undo `steps` entries (desktop `DeckStateManager::undo(steps)`), or `null`
 * when there is nothing to undo. Steps beyond the stack are ignored.
 */
export function undoDeck(history: DeckHistory, current: HydratedDeck, steps = 1): HistoryStep | null {
  return move(history, current, steps, 'undo');
}

/** Redo `steps` entries, or `null` when there is nothing to redo. */
export function redoDeck(history: DeckHistory, current: HydratedDeck, steps = 1): HistoryStep | null {
  return move(history, current, steps, 'redo');
}

function move(history: DeckHistory, current: HydratedDeck, steps: number, from: 'undo' | 'redo'): HistoryStep | null {
  const to = from === 'undo' ? 'redo' : 'undo';
  let source = history[from];
  let target = history[to];
  let deck = current;
  for (let i = 0; i < steps && source.length > 0; i++) {
    const entry = source[source.length - 1];
    // `DeckListHistoryManager::restoreAndSwap`: the current deck goes to the
    // opposite stack under the moved entry's reason.
    target = [...target, { deck, reason: entry.reason, at: entry.at }];
    source = source.slice(0, -1);
    deck = entry.deck;
  }
  if (deck === current) {
    return null;
  }
  const next: DeckHistory = from === 'undo' ? { undo: source, redo: target } : { undo: target, redo: source };
  return { history: next, deck };
}

/** One row of the history list (desktop `DeckListHistoryManagerWidget`). */
export interface DeckHistoryRow {
  mode: 'undo' | 'redo';
  reason: DeckHistoryReason;
  /** Steps that bring the deck to the state before (undo) / after (redo) this entry. */
  steps: number;
}

/**
 * The history list as desktop shows it: redo entries first (the furthest
 * redo at the top, the next redo just above the divider), then undo entries
 * from the most recent down to the oldest.
 */
export function deckHistoryRows(history: DeckHistory): { redo: DeckHistoryRow[]; undo: DeckHistoryRow[] } {
  const redo = history.redo.map((entry, i) => ({
    mode: 'redo' as const,
    reason: entry.reason,
    steps: history.redo.length - i,
  }));
  const undo = history.undo
    .map((entry, i) => ({ mode: 'undo' as const, reason: entry.reason, steps: history.undo.length - i }))
    .reverse();
  return { redo, undo };
}
