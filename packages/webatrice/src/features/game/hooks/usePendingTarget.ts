import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { ArrowTarget } from '../components/ui/PlayerBoard/playerBoard.types';
import { useTargetCommandsFor } from '../components/ui/GameBoardCell/usePlayerTargetCommands';
import { createPendingPointerStore, type PendingPointer, type PendingPointerStore } from './pendingPointerStore';
import { planArrow, planAttach, sendArrowPlan, type ArrowPlan, type ArrowSource } from './arrowResolution';
import { arrowTargetAt } from './useArrowDrag';
import { useGameAccess } from './useGameAccess';

export interface PendingTargetSource extends ArrowSource {
  /** Shown while the pick is pending. */
  name: string;
}

/** A menu- or shortcut-started target pick (desktop's grabbed ArrowDragItem /
 *  ArrowAttachItem). An attach carries every card that attaches; the source
 *  is the one the arrow is drawn from. */
export type PendingTarget =
  | { kind: 'arrow'; source: PendingTargetSource }
  | { kind: 'attach'; source: PendingTargetSource; extraSourceIds: readonly number[] };

export interface PendingTargetPicker {
  pending: PendingTarget | null;
  /** The pointer while a pick is pending, for the live arrow. Read it with
   *  `usePendingPointer`; it is not part of this value's identity. */
  pointer: PendingPointerStore;
  startArrow(source: PendingTargetSource): void;
  /** Attach `source` and `extraSourceIds` (battlefield cards of one player). */
  startAttach(source: PendingTargetSource, extraSourceIds?: readonly number[]): void;
  cancel(): void;
  /** Resolve the pending pick against `target` (a cancel when the plan sends
   *  nothing). False, leaving the pick pending, when nothing is pending. */
  pick(target: ArrowTarget): boolean;
  /** As `pick`, for a press on a battlefield card, which only resolves an attach. */
  pickAttachTarget(target: ArrowTarget): boolean;
}

/**
 * The game's one pending target pick: "Draw arrow..." and "Attach to card..."
 * from any card menu or shortcut. An arrow resolves on the next left click on
 * a card or a player, anywhere on the board; an attach on the next press on a
 * battlefield card (the seat's press release calls `pickAttachTarget`).
 * Escape cancels either (unless a MUI dialog takes it), as does a click on
 * the source or, for an arrow, on nothing.
 */
export function usePendingTarget(gameId: number | undefined): PendingTargetPicker {
  const { localPlayerId } = useGameAccess(gameId);
  const targetCommandsFor = useTargetCommandsFor(gameId);
  const [pending, setPending] = useState<PendingTarget | null>(null);
  const [pointer] = useState(createPendingPointerStore);
  // The press-release and click resolvers run from listeners registered
  // earlier; they read the pick as it is now.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const resolve = useCallback((target: ArrowTarget, only?: PendingTarget['kind']): boolean => {
    const current = pendingRef.current;
    if (!current || (only && current.kind !== only)) {
      return false;
    }
    const { source } = current;
    const plan: ArrowPlan = current.kind === 'arrow'
      ? planArrow(source, target, localPlayerId)
      : planAttach(source.playerId, [source.cardId, ...current.extraSourceIds], target);
    if (targetCommandsFor) {
      sendArrowPlan(plan, targetCommandsFor);
    }
    pendingRef.current = null;
    setPending(null);
    return true;
  }, [localPlayerId, targetCommandsFor]);

  // An arrow pick resolves on the next left click anywhere. Capture phase, so
  // it runs before the cards' own click handlers.
  const arrowPending = pending?.kind === 'arrow';
  useEffect(() => {
    if (!arrowPending) {
      return undefined;
    }
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      const target = arrowTargetAt(e.target instanceof Element ? e.target : null);
      if (!target) {
        // A click on nothing cancels, and still reaches what it hit.
        setPending(null);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      resolve(target);
    };
    window.addEventListener('click', onClick, { capture: true });
    return () => window.removeEventListener('click', onClick, { capture: true });
  }, [arrowPending, resolve]);

  // Escape cancels a pick, whatever has focus, unless a MUI dialog takes it
  // first; the pointer is tracked meanwhile for the live arrow.
  const active = pending != null;
  useEffect(() => {
    if (!active) {
      pointer.set(null);
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.MuiDialog-root[role="dialog"]')) {
        e.preventDefault();
        setPending(null);
      }
    };
    const onMove = (e: MouseEvent) => pointer.set({ x: e.clientX, y: e.clientY });
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
    };
  }, [active, pointer]);

  const actions = useMemo(() => ({
    startArrow: (source: PendingTargetSource) => setPending({ kind: 'arrow', source }),
    startAttach: (source: PendingTargetSource, extraSourceIds: readonly number[] = []) =>
      setPending({ kind: 'attach', source, extraSourceIds }),
    cancel: () => setPending(null),
    pick: (target: ArrowTarget) => resolve(target),
    pickAttachTarget: (target: ArrowTarget) => resolve(target, 'attach'),
  }), [resolve]);

  return useMemo(() => ({ pending, pointer, ...actions }), [pending, pointer, actions]);
}

/** The pending pick's pointer; re-renders the caller on every mouse move. */
export function usePendingPointer(store: PendingPointerStore): PendingPointer | null {
  return useSyncExternalStore(store.subscribe, store.get);
}
