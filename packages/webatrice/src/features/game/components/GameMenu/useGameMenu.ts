import { nextPhase } from '../PhaseTrack/phaseActions';
import { useNextPhaseAction } from '../PhaseTrack/useNextPhaseAction';
import { usePhaseBar } from '../PhaseTrack/usePhaseBar';
import { ROTATE_CLOCKWISE, ROTATE_COUNTERCLOCKWISE } from '../../hooks/useGameBoardLayout';
import { useGameDialogActions } from '../ui/GameDialogActionsContext';
import { buildGameMenuItems, type GameMenuEntry } from './gameMenu.model';

/** The game menu's entries for `gameId`, wired to the phase bar, Command_ReverseTurn and the board rotation. */
export function useGameMenu(gameId: number | undefined): GameMenuEntry[] {
  const { activePhase, canAdvancePhase, canPassTurn, canReverseTurn, handlePhaseClick, handlePass, handleReverseTurn } =
    usePhaseBar(gameId);
  const nextPhaseAction = useNextPhaseAction(gameId);
  const { onRotateView } = useGameDialogActions();

  return buildGameMenuItems({
    canAdvancePhase,
    canPassTurn,
    canReverseTurn,
    canRunNextPhaseAction: nextPhaseAction.canRun,
    onNextPhase: () => handlePhaseClick(nextPhase(activePhase ?? -1)),
    onNextPhaseAction: nextPhaseAction.run,
    onNextTurn: handlePass,
    onReverseTurn: handleReverseTurn,
    onRotateViewCW: () => onRotateView(ROTATE_CLOCKWISE),
    onRotateViewCCW: () => onRotateView(ROTATE_COUNTERCLOCKWISE),
  });
}
