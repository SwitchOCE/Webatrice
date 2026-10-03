import { useWebClient } from '@cockatrice/datatrice/react';

import { nextPhase } from '../PhaseTrack/phaseActions';
import { useNextPhaseAction } from '../PhaseTrack/useNextPhaseAction';
import { usePhaseBar } from '../PhaseTrack/usePhaseBar';
import { buildGameMenuItems, type GameMenuEntry } from './gameMenu.model';

/** The game menu's entries for `gameId`, wired to the phase bar and Command_ReverseTurn. */
export function useGameMenu(gameId: number | undefined): GameMenuEntry[] {
  const webClient = useWebClient();
  const { activePhase, canAdvancePhase, canPassTurn, handlePhaseClick, handlePass } = usePhaseBar(gameId);
  const nextPhaseAction = useNextPhaseAction(gameId);

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
  });
}
