import { useMemo } from 'react';
import { useStore } from 'react-redux';

import { games } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { ArrowColor } from '@app/types';
import type { RootState } from '@app/store';

import { useGameId } from '../GameIdContext';
import type { PlayerTargetCommands } from '../PlayerBoard/playerBoard.types';

type AttachCardParams = Parameters<ReturnType<typeof useWebClient>['request']['game']['attachCard']>[1];
type CreateArrowParams = Parameters<ReturnType<typeof useWebClient>['request']['game']['createArrow']>[1];

/**
 * Arrows and attachments drawn from one seat. Undefined until the game id is
 * known.
 *
 * Both commands rely on proto2 field presence: an unattach and a
 * player-targeted arrow OMIT their target fields, so Servatrice's
 * `has_target_*()` checks return false. Sending -1 / '' would mark the fields
 * as set and the server would reject the target.
 */
export function usePlayerTargetCommands(playerId: number): PlayerTargetCommands | undefined {
  const gameId = useGameId();
  const webClient = useWebClient();
  const store = useStore<RootState>();

  return useMemo(() => {
    if (gameId == null) {
      return undefined;
    }
    const game = webClient.request.game;
    return {
      // Desktop ArrowAttachItem::attachCards (arrow_item.cpp:374-392). The menu
      // is only reachable from a battlefield card, so the source is on TABLE.
      attach: (sourceCardId, target) => {
        game.attachCard(gameId, {
          startZone: ZoneName.TABLE,
          cardId: sourceCardId,
          targetPlayerId: target.playerId,
          targetZone: ZoneName.TABLE,
          targetCardId: target.cardId,
        });
      },
      // Desktop actUnattach (player_actions.cpp:1503-1517) sets only
      // start_zone and card_id.
      unattach: (sourceCardId) => {
        game.attachCard(gameId, { startZone: ZoneName.TABLE, cardId: sourceCardId } as AttachCardParams);
      },
      // Arrows start in any public zone (TABLE, or GRAVE / EXILE from a pile
      // view) and end on a battlefield card or a player. The menu path draws
      // red; it has no modifier keys.
      createArrow: (sourceCardId, sourceZone, target) => {
        const base = {
          startPlayerId: playerId,
          startZone: sourceZone,
          startCardId: sourceCardId,
          targetPlayerId: target.playerId,
          arrowColor: ArrowColor.RED,
        };
        const params = target.kind === 'card'
          ? { ...base, targetZone: ZoneName.TABLE, targetCardId: target.cardId }
          : base;
        game.createArrow(gameId, params as CreateArrowParams);
      },
      // Desktop clearArrowsForPlayer (Ctrl+R): one Command_DeleteArrow per
      // arrow this player created; other players' arrows are untouched.
      clearOwnArrows: () => {
        const arrows = games.Selectors.getPlayer(store.getState(), gameId, playerId)?.arrows ?? {};
        for (const arrowId of Object.keys(arrows)) {
          const id = Number(arrowId);
          if (Number.isFinite(id)) {
            game.deleteArrow(gameId, { arrowId: id });
          }
        }
      },
    };
  }, [gameId, webClient, store, playerId]);
}
