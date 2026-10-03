import { useMemo } from 'react';
import { useStore } from 'react-redux';

import { games } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { ZoneName } from '@cockatrice/sockatrice';
import {
  CardAttribute,
  Command_CreateToken_TargetMode,
  type ServerInfo_Card,
} from '@cockatrice/sockatrice/generated';
import { CardDTO } from '@app/services';
import { useAppDispatch, type RootState } from '@app/store';

import { parseTableRow, tokenGridYFromCardDatabaseRow } from '../../battlefield/Battlefield/cardPlacement';
import { useGameId } from '../GameIdContext';
import type { PlayerCardCommands } from '../PlayerBoard/playerBoard.types';

/**
 * Commands on one seat's battlefield cards. Undefined until the game id is
 * known; `peek` exists only on the local player's seat.
 *
 * Tap and P/T are optimistic: the field is patched in Datatrice first (the
 * patch reducer is idempotent, so the server echo re-applies harmlessly) and
 * restored if the server rejects the command.
 */
export function usePlayerCardCommands(playerId: number, isLocal: boolean): PlayerCardCommands | undefined {
  const gameId = useGameId();
  const webClient = useWebClient();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  return useMemo(() => {
    if (gameId == null) {
      return undefined;
    }
    const game = webClient.request.game;
    const setAttr = (cardId: number, attribute: CardAttribute, attrValue: string) =>
      game.setCardAttr(gameId, { zone: ZoneName.TABLE, cardId, attribute, attrValue });
    const patchCard = (cardId: number, fields: Partial<ServerInfo_Card>) =>
      dispatch(games.Actions.cardFieldsUpdated({ gameId, playerId, zoneName: ZoneName.TABLE, cardId, fields }));
    const tableCard = (cardId: number) =>
      games.Selectors.getZone(store.getState(), gameId, playerId, ZoneName.TABLE)?.byId[cardId];

    const commands: PlayerCardCommands = {
      // Command_SetCardAttr addresses one card, so a group tap sends one per
      // card. Cards not in state yet, or already in the target state, skip
      // the optimistic step.
      setTapped: (cardIds, tapped) => {
        const attrValue = tapped ? '1' : '0';
        for (const cardId of cardIds) {
          const currentCard = tableCard(cardId);
          if (currentCard == null || currentCard.tapped === tapped) {
            setAttr(cardId, CardAttribute.AttrTapped, attrValue);
            continue;
          }
          const previousTapped = currentCard.tapped;
          patchCard(cardId, { tapped });
          const opKey = games.attrOpKey(playerId, cardId, CardAttribute.AttrTapped);
          games.beginOptimistic(opKey, () => patchCard(cardId, { tapped: previousTapped }));
          game.setCardAttr(
            gameId,
            { zone: ZoneName.TABLE, cardId, attribute: CardAttribute.AttrTapped, attrValue },
            undefined,
            {
              onError: (responseCode) => {
                console.warn(
                  `Command_SetCardAttr(tapped=${tapped}) rejected with code ${responseCode}; rolling back cardId ${cardId}`,
                );
                games.rollbackOptimistic(opKey);
              },
            },
          );
        }
      },
      // cardId = -1 untaps the whole TABLE server-side, honouring each card's
      // doesntUntap (same wire as the phase bar's untap-step double-click).
      untapAll: () => setAttr(-1, CardAttribute.AttrTapped, '0'),
      flip: (cardId, faceDown) => game.flipCard(gameId, { zone: ZoneName.TABLE, cardId, faceDown }),
      setDoesntUntap: (cardId, doesntUntap) => setAttr(cardId, CardAttribute.AttrDoesntUntap, doesntUntap ? '1' : '0'),
      // Empty string clears the annotation (desktop actSetAnnotation).
      setAnnotation: (cardId, annotation) => setAttr(cardId, CardAttribute.AttrAnnotation, annotation),
      // One Command_SetCardAttr(AttrPT) per card, like desktop actIncPT.
      setPT: (items) => {
        for (const { cardId, pt } of items) {
          const previousPt = tableCard(cardId)?.pt ?? '';
          if (previousPt !== pt) {
            patchCard(cardId, { pt });
          }
          game.setCardAttr(
            gameId,
            { zone: ZoneName.TABLE, cardId, attribute: CardAttribute.AttrPT, attrValue: pt },
            undefined,
            {
              onError: (code) => {
                console.warn(`setCardAttr(pt) rejected (${code}); rolling back cardId ${cardId} to "${previousPt}"`);
                patchCard(cardId, { pt: previousPt });
              },
            },
          );
        }
      },
      // Desktop cmClone (player_actions.cpp:1812): a destroy-on-zone-change
      // token with the source's identity; the server picks the column.
      clone: (source) => {
        game.createToken(gameId, {
          zone: ZoneName.TABLE,
          cardName: source.name,
          cardProviderId: source.providerId,
          color: source.color,
          pt: source.pt,
          annotation: source.annotation,
          destroyOnZoneChange: true,
          x: -1,
          y: source.y,
        });
      },
      // Desktop actCreateToken (player_actions.cpp:878-916): x = -1 lets the
      // server pick a column; the row comes from the card database tablerow
      // (face-down tokens and unknown names use the top row). Transform mode
      // also sends target_zone (player_actions.cpp:1198-1206).
      createToken: async (request) => {
        const tablerow = request.faceDown
          ? null
          : parseTableRow((await CardDTO.get(request.name).catch(() => undefined))?.tablerow?.value);
        const visualY = tokenGridYFromCardDatabaseRow(tablerow, request.faceDown);
        const isTransform = request.targetCardId != null && request.targetMode === 'transform_into';
        game.createToken(gameId, {
          zone: ZoneName.TABLE,
          cardName: request.name,
          cardProviderId: request.providerId ?? '',
          color: request.color,
          pt: request.pt,
          annotation: request.annotation,
          destroyOnZoneChange: request.destroyOnZoneChange,
          faceDown: request.faceDown,
          x: -1,
          y: visualY,
          ...(isTransform
            ? {
              targetZone: ZoneName.TABLE,
              targetCardId: request.targetCardId,
              targetMode: Command_CreateToken_TargetMode.TRANSFORM_INTO,
            }
            : {}),
        });
      },
    };

    if (isLocal) {
      // One reveal per card to the local player only; bulkPeek reads just `.id`.
      commands.peek = (cardIds) => {
        if (cardIds.length === 0) {
          return;
        }
        const targets = cardIds.map((id) => ({
          ownerPlayerId: playerId,
          zone: ZoneName.TABLE,
          card: { id } as ServerInfo_Card,
        }));
        game.bulkPeek(gameId, targets, playerId);
      };
    }
    return commands;
  }, [gameId, webClient, dispatch, store, playerId, isLocal]);
}
