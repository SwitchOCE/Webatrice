import { useMemo } from 'react';
import { useStore } from 'react-redux';

import { games } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { getSettings } from '@app/hooks';
import { ArrowColor } from '@app/types';
import type { RootState } from '@app/store';

import { playCardViaTableRow } from '../../../hooks/playCard';
import { useJudgeTarget } from '../../../hooks/useJudgeTarget';
import { useGameId } from '../GameIdContext';
import type { PlayerTargetCommands } from '../PlayerBoard/playerBoard.types';

type AttachCardParams = Parameters<ReturnType<typeof useWebClient>['request']['game']['attachCard']>[1];
type CreateArrowParams = Parameters<ReturnType<typeof useWebClient>['request']['game']['createArrow']>[1];

/** The target commands of any player's cards, for the game-level arrow paths. */
export type TargetCommandsFor = (playerId: number) => PlayerTargetCommands;

/**
 * Arrows and attachments from any player's cards. Undefined until the game id
 * is known.
 *
 * Both commands rely on proto2 field presence: an unattach and a
 * player-targeted arrow OMIT their target fields, so Servatrice's
 * `has_target_*()` checks return false. Sending -1 / '' would mark the fields
 * as set and the server would reject the target.
 */
export function useTargetCommandsFor(gameId: number | undefined): TargetCommandsFor | undefined {
  const webClient = useWebClient();
  const store = useStore<RootState>();
  const judgeTarget = useJudgeTarget(gameId);

  return useMemo(() => {
    if (gameId == null) {
      return undefined;
    }
    const id = gameId;
    return (playerId: number): PlayerTargetCommands => {
      const game = webClient.request.game;
      const zone = (name: string) => games.Selectors.getZone(store.getState(), id, playerId, name);
      const createArrow: PlayerTargetCommands['createArrow'] = (sourceCardId, sourceZone, target, color = ArrowColor.RED) => {
        const base = {
          startPlayerId: playerId,
          startZone: sourceZone,
          startCardId: sourceCardId,
          targetPlayerId: target.playerId,
          arrowColor: color,
        };
        const params = target.kind === 'card'
          ? { ...base, targetZone: target.zone, targetCardId: target.cardId }
          : base;
        game.createArrow(id, params as CreateArrowParams);
      };
      return {
        // Desktop ArrowAttachItem::attachCards (arrow_item.cpp:556-571). Only a
        // battlefield card can start an attach, so the source is on TABLE.
        attach: (sourceCardId, target) => {
          game.attachCard(id, {
            startZone: ZoneName.TABLE,
            cardId: sourceCardId,
            targetPlayerId: target.playerId,
            targetZone: ZoneName.TABLE,
            targetCardId: target.cardId,
          }, judgeTarget(playerId));
        },
        // Desktop actUnattach (player_actions.cpp:1503-1517) sets only
        // start_zone and card_id.
        unattach: (sourceCardId) => {
          game.attachCard(id, { startZone: ZoneName.TABLE, cardId: sourceCardId } as AttachCardParams, judgeTarget(playerId));
        },
        createArrow,
        playAndCreateArrow: (handCardId, target, color) => {
          const card = zone(ZoneName.HAND)?.byId[handCardId];
          if (!card) {
            return;
          }
          void (async () => {
            const settings = await getSettings().catch(() => undefined);
            const playedZone = await playCardViaTableRow({
              webClient,
              gameId: id,
              sourcePlayerId: playerId,
              sourceZone: ZoneName.HAND,
              card,
              faceDown: false,
              isInverted: settings?.invertVerticalCoordinate ?? false,
              tableZone: zone(ZoneName.TABLE),
              judgeTargetId: judgeTarget(playerId),
            });
            createArrow(handCardId, playedZone, target, color);
          })();
        },
        // Desktop clearArrowsForPlayer (Ctrl+R): one Command_DeleteArrow per
        // arrow this player created; other players' arrows are untouched.
        clearOwnArrows: () => {
          const arrows = games.Selectors.getPlayer(store.getState(), id, playerId)?.arrows ?? {};
          for (const key of Object.keys(arrows)) {
            const arrowId = Number(key);
            if (Number.isFinite(arrowId)) {
              game.deleteArrow(id, { arrowId });
            }
          }
        },
      };
    };
  }, [gameId, webClient, store, judgeTarget]);
}

/** Arrows and attachments drawn from one seat. Undefined until the game id is known. */
export function usePlayerTargetCommands(playerId: number): PlayerTargetCommands | undefined {
  const commandsFor = useTargetCommandsFor(useGameId());
  return useMemo(() => commandsFor?.(playerId), [commandsFor, playerId]);
}
