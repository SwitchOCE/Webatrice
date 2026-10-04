import { Phase } from '@cockatrice/datatrice';
import type { ActionId } from '@app/feature-widgets/shortcuts';

/** Desktop's phasesToolbar->phaseCount(): Untap through End. */
export const PHASE_COUNT = 11;

/** Desktop's direct phase shortcuts (Player/phase0 … phase10), indexed by phase. */
export const PHASE_SHORTCUT_ACTIONS = [
  'game.setPhase0',
  'game.setPhase1',
  'game.setPhase2',
  'game.setPhase3',
  'game.setPhase4',
  'game.setPhase5',
  'game.setPhase6',
  'game.setPhase7',
  'game.setPhase8',
  'game.setPhase9',
  'game.setPhase10',
] as const satisfies readonly ActionId[];

/** The phase after `current`, wrapping End to Untap (desktop TabGame::actNextPhase).
 *  A game with no phase yet (-1) goes to Untap. */
export function nextPhase(current: number): Phase {
  return current >= 0 ? (current + 1) % PHASE_COUNT : Phase.Untap;
}

/** The phase before `current`, wrapping Untap to End. Webatrice-only: desktop has no previous-phase action. */
export function previousPhase(current: number): Phase {
  return current > 0 ? current - 1 : PHASE_COUNT - 1;
}

/** A phase button's double-click action (desktop PhasesToolbar: Untap untaps all, Draw draws one). */
export type PhaseFollowUp = 'untapAll' | 'drawOne' | null;

export interface NextPhaseActionPlan {
  /** Wrapping past End passes the turn instead of setting phase 0. */
  advance: 'nextTurn' | { phase: Phase };
  then: PhaseFollowUp;
}

/**
 * "Next phase with action" (desktop TabGame::actNextPhaseAction): advance one
 * phase, sending Command_NextTurn when that wraps to Untap, then run the new
 * phase's double-click action through PhasesToolbar::triggerPhaseAction.
 */
export function nextPhaseActionPlan(current: number): NextPhaseActionPlan {
  const phase = nextPhase(current);
  return {
    advance: phase === Phase.Untap ? 'nextTurn' : { phase },
    then: phaseFollowUp(phase),
  };
}

function phaseFollowUp(phase: Phase): PhaseFollowUp {
  switch (phase) {
    case Phase.Untap:
      return 'untapAll';
    case Phase.Draw:
      return 'drawOne';
    default:
      return null;
  }
}
