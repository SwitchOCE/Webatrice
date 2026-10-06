import { useMemo } from 'react';

import { useGameReadOnly } from '../components/ui/GameReadOnlyContext';
import { useCurrentGame } from './useCurrentGame';

export interface GameAffordances {
  hasLiveGame: boolean;
  isParticipant: boolean;
  isConceded: boolean;
  isStarted: boolean;
  canPassTurn: boolean;
  canReverseTurn: boolean;
  canAdvancePhase: boolean;
  canConcede: boolean;
  canUnconcede: boolean;
  canRoll: boolean;
}

/**
 * What the local user may do in `gameId`. A read-only board (replay playback)
 * has no live game to act on, so every affordance is off there — the phase
 * track, sidebar and game shortcuts all gate on these.
 */
export function useGameAffordances(gameId: number | undefined): GameAffordances {
  const { game, localPlayer, isSpectator, isJudge, isStarted } = useCurrentGame(gameId);
  const readOnly = useGameReadOnly();

  return useMemo<GameAffordances>(() => {
    const hasLiveGame = !readOnly && gameId != null && game != null;
    const isParticipant = hasLiveGame && !isSpectator;
    const isConceded = localPlayer?.properties.conceded ?? false;
    const canPassTurn =
      hasLiveGame && isStarted && !isConceded && (isJudge || isParticipant);
    // server_player.cpp:600 exempts judges from the conceded reverse-turn guard.
    const canReverseTurn =
      hasLiveGame && isStarted && (isJudge || (isParticipant && !isConceded));
    const canAdvancePhase =
      hasLiveGame && isStarted && (isJudge || game.activePlayerId === game.localPlayerId);
    const canConcede = isParticipant && !isConceded;
    const canUnconcede = isParticipant && isConceded;
    const canRoll = hasLiveGame && (isParticipant || isJudge);

    return {
      hasLiveGame,
      isParticipant,
      isConceded,
      isStarted,
      canPassTurn,
      canReverseTurn,
      canAdvancePhase,
      canConcede,
      canUnconcede,
      canRoll,
    };
  }, [readOnly, gameId, game, localPlayer, isSpectator, isJudge, isStarted]);
}
