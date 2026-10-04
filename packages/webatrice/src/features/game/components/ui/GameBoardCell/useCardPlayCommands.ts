import { useMemo } from 'react';
import { useStore } from 'react-redux';

import { games } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { ZoneName } from '@cockatrice/sockatrice';
import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import { usePreference, useSettings } from '@app/hooks';
import type { RootState } from '@app/store';

import { autoPlayCard } from '../../../hooks/playCard';
import { useJudgeTarget } from '../../../hooks/useJudgeTarget';
import type { SelectedCard } from '../../../utils/selection';

/** The double-click commands on any player's card. */
export interface CardPlayCommands {
  /** Desktop's collective tap over battlefield cards: tap them all if any is
   *  untapped, else untap them all, in one command container. */
  tap(targets: readonly SelectedCard[]): void;
  /** The double-click play chain: hand → stack (lands → battlefield), then
   *  stack → graveyard or battlefield (see autoPlayCard). */
  autoPlay(ownerPlayerId: number, zone: string, card: ServerInfo_Card): void;
}

/**
 * Card double-click commands for the game-level card handlers. A judge acting
 * on another player's card wraps each command as that card's owner.
 * Undefined until the game id is known.
 */
export function useCardPlayCommands(gameId: number | undefined): CardPlayCommands | undefined {
  const webClient = useWebClient();
  const store = useStore<RootState>();
  const judgeTarget = useJudgeTarget(gameId);
  const { value: settings } = useSettings();
  const invertVerticalCoordinate = settings?.invertVerticalCoordinate ?? false;
  const playToStack = usePreference('playToStack');

  return useMemo(() => {
    if (gameId == null) {
      return undefined;
    }
    return {
      tap: (targets) => webClient.request.game.bulkTap(gameId, targets, judgeTarget),
      autoPlay: (ownerPlayerId, zone, card) => {
        void autoPlayCard({
          webClient,
          gameId,
          sourcePlayerId: ownerPlayerId,
          sourceZone: zone,
          card,
          faceDown: false,
          isInverted: invertVerticalCoordinate,
          tableZone: games.Selectors.getZone(store.getState(), gameId, ownerPlayerId, ZoneName.TABLE),
          judgeTargetId: judgeTarget(ownerPlayerId),
          playToStack,
        });
      },
    };
  }, [gameId, webClient, store, judgeTarget, invertVerticalCoordinate, playToStack]);
}
