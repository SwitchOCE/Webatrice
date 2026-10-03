import { useWebClient } from '@cockatrice/datatrice/react';

import { nextPhase } from '../PhaseTrack/phaseActions';
import { useNextPhaseAction } from '../PhaseTrack/useNextPhaseAction';
import { usePhaseBar } from '../PhaseTrack/usePhaseBar';
import { ROTATE_CLOCKWISE, ROTATE_COUNTERCLOCKWISE } from '../../hooks/useGameBoardLayout';
import { useGameDialogActions } from '../ui/GameDialogActionsContext';
import { buildGameMenuItems, type GameMenuEntry } from './gameMenu.model';

/** The game menu's entries for `gameId`, wired to the phase bar, Command_ReverseTurn and the board rotation. */
export function useGameMenu(gameId: number | undefined): GameMenuEntry[] {
  const webClient = useWebClient();
  const { activePhase, canAdvancePhase, canPassTurn, handlePhaseClick, handlePass } = usePhaseBar(gameId);
  const nextPhaseAction = useNextPhaseAction(gameId);
  const { onRotateView } = useGameDialogActions();

  return buildGameMenuItems({
    canAdvancePhase,
    canPassTurn,
    canRunNextPhaseAction: nextPhaseAction.canRun,
    onNextPhase: () => handlePhaseClick(nextPhase(activePhase ?? -1)),
    onNextPhaseAction: nextPhaseAction.run,
    onNextTurn: handlePass,
    onReverseTurn: () => {
      // Desktop asks for no confirmation (tab_game.cpp aReverseTurn).
      if (canPassTurn && gameId != null) {
        webClient.request.game.reverseTurn(gameId);
      }
    },
    onRotateViewCW: () => onRotateView(ROTATE_CLOCKWISE),
    onRotateViewCCW: () => onRotateView(ROTATE_COUNTERCLOCKWISE),
  });
}
