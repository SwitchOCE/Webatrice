import { useStore } from 'react-redux';
import { games } from '@cockatrice/datatrice';
import type { RootState } from '@app/store';

import { nextPhaseActionPlan } from './phaseActions';
import { usePhaseBar } from './usePhaseBar';

export interface NextPhaseAction {
  /** Whether the local user may run it from the current phase (see the gate below). */
  canRun: boolean;
  run: () => void;
}

/**
 * "Next phase with action" (desktop TabGame::actNextPhaseAction), shared by the
 * game menu and the `game.nextPhaseAction` shortcut. Sends through the phase
 * bar's handlers in desktop's order: the advance first, then the new phase's
 * double-click action.
 *
 * Stricter than desktop on purpose: desktop runs it for anyone and lets the
 * server reject Command_SetActivePhase while the draw or untap still goes
 * through. Here the whole action needs `canAdvancePhase`, plus `canPassTurn`
 * when it wraps, so it never lands half-applied.
 */
export function useNextPhaseAction(gameId: number | undefined): NextPhaseAction {
  const store = useStore<RootState>();
  const { activePhase, canPassTurn, canAdvancePhase, handlePhaseClick, handlePass, handleUntapAll, handleDrawOne } =
    usePhaseBar(gameId);
  const allowed = (current: number) =>
    canAdvancePhase && (nextPhaseActionPlan(current).advance !== 'nextTurn' || canPassTurn);

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
      handlePass();
    } else {
      handlePhaseClick(plan.advance.phase);
    }
    if (plan.then === 'untapAll') {
      handleUntapAll();
    } else if (plan.then === 'drawOne') {
      handleDrawOne();
    }
  };

  return { canRun: allowed(activePhase ?? -1), run };
}
