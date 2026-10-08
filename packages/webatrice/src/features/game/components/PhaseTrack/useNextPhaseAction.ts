import { useStore } from 'react-redux';
import { games } from '@cockatrice/datatrice';
import type { RequestId } from '@cockatrice/sockatrice/types';
import type { RootState } from '@app/store';
import { useReduxEffect, useRequestTracker } from '@app/hooks';
import { onSessionEnd } from '@app/services/session';

import { nextPhaseActionPlan } from './phaseActions';
import { usePhaseBar } from './usePhaseBar';

export interface NextPhaseAction {
  /** Whether the local user may run it from the current phase (see the gate below). */
  canRun: boolean;
  run: () => void;
}

/**
 * Games with a wrap sent from End that the server has not answered yet, per
 * store. Command_NextTurn is not optimistic, so without this a second press
 * before the answer would pass the turn again (skipping a seat at 3+ players).
 * Module-level so the menu and the shortcut, which each hold their own hook,
 * share it; only its own outcome or session end releases a pending wrap.
 */
let pendingWraps = new WeakMap<object, Map<number, RequestId>>();
onSessionEnd(() => {
  pendingWraps = new WeakMap();
});

/**
 * "Next phase with action" (desktop TabGame::actNextPhaseAction), shared by the
 * game menu and the `game.nextPhaseAction` shortcut. Sends through the phase
 * bar's handlers in desktop's order: the advance first, then the new phase's
 * double-click action.
 *
 * Gated as spec §1 says: on `canAdvancePhase` for a phase step, and on
 * `canPassTurn` alone for the wrap from End (so an off-turn player may wrap,
 * as on desktop). Desktop gates neither and lets the server reject
 * Command_SetActivePhase while the draw still goes through; requiring
 * `canAdvancePhase` for the step keeps it from landing half-applied.
 */
export function useNextPhaseAction(gameId: number | undefined): NextPhaseAction {
  const store = useStore<RootState>();
  const { activePhase, canPassTurn, canAdvancePhase, handlePhaseClick, handlePassAndUntap, handleUntapAll, handleDrawOne } =
    usePhaseBar(gameId);
  const requests = useRequestTracker();

  useReduxEffect<{ gameId: number; requestId?: RequestId }>(({ payload }) => {
    const pending = pendingWraps.get(store);
    if (payload.requestId !== undefined && pending?.get(payload.gameId) === payload.requestId) {
      // Any mounted hook may consume the outcome, even after the sender unmounts.
      // Delete once so the menu and shortcut cannot handle the same wrap twice.
      pending.delete(payload.gameId);
    }
  }, [games.Types.NEXT_TURN_ANSWERED, games.Types.NEXT_TURN_FAILED], [store]);

  const allowed = (current: number) =>
    nextPhaseActionPlan(current).advance === 'nextTurn' ? canPassTurn : canAdvancePhase;

  const run = () => {
    if (gameId == null) {
      return;
    }
    // Read the store, not the render: a second press before the re-render
    // must step from the phase the first one set.
    const current = games.Selectors.getActivePhase(store.getState(), gameId) ?? -1;
    if (!allowed(current)) {
      return;
    }
    const plan = nextPhaseActionPlan(current);
    if (plan.advance === 'nextTurn') {
      let pending = pendingWraps.get(store);
      if (!pending) {
        pending = new Map();
        pendingWraps.set(store, pending);
      }
      if (pending.has(gameId)) {
        return;
      }
      const requestId = requests.begin();
      pending.set(gameId, requestId);
      // The untap is the Untap step's action, so it rides on the pass's gate.
      // A pass that was not sent has no outcome to release the guard.
      if (handlePassAndUntap(requestId) === undefined) {
        pending.delete(gameId);
      }
      return;
    }
    handlePhaseClick(plan.advance.phase);
    if (plan.then === 'untapAll') {
      handleUntapAll();
    } else if (plan.then === 'drawOne') {
      handleDrawOne();
    }
  };

  return { canRun: allowed(activePhase ?? -1), run };
}
