import { useMemo } from 'react';
import { useStore } from 'react-redux';

import { games, type ZoneEntry } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { ZoneName } from '@cockatrice/sockatrice';
import type { MoveCardParams } from '@cockatrice/sockatrice/generated';
import { useAppDispatch, type RootState } from '@app/store';

import { useGameId } from '../GameIdContext';
import type { PlayerZoneCommands, RevealRecipient, RevealSelection } from '../PlayerBoard/playerBoard.types';

// Desktop's random-card sentinel for Command_RevealCards.card_id (player_actions.h:42).
const RANDOM_CARD_FROM_ZONE = -2;

/**
 * Resolve a battlefield drop to a free sub-slot on the target player's board.
 * PlayerBox only sees its own seat, so it always asks for sub-slot 0; without
 * this an opponent gift would land on sub-slot 0 and only settle when the
 * server echo arrives.
 *
 * Tries the requested column first, then walks outward (right, left, two
 * right, ...) to the first column with a free sub-slot. If the whole row is
 * full it keeps `column * 3` so the wire stays legal and the listener's
 * field-patch fallback picks up whatever Servatrice decided. Cards being moved
 * within the same TABLE don't count as occupying their old slot.
 */
export function resolveBattlefieldDropX(params: MoveCardParams, targetBattlefield: ZoneEntry): number {
  const x = params.x ?? 0;
  const requestedCol = Math.floor(x / 3);
  const row = params.y;
  const excludeIds = new Set((params.cardsToMove?.card ?? []).map((c) => c.cardId));
  const sameZoneSource = params.startPlayerId === params.targetPlayerId && params.startZone === ZoneName.TABLE;
  const occupiedByCol = new Map<number, Set<number>>();
  for (const id of targetBattlefield.order) {
    if (sameZoneSource && excludeIds.has(id)) {
      continue;
    }
    const c = targetBattlefield.byId[id];
    if (!c || c.y !== row) {
      continue;
    }
    const col = Math.floor(c.x / 3);
    let slots = occupiedByCol.get(col);
    if (!slots) {
      slots = new Set();
      occupiedByCol.set(col, slots);
    }
    slots.add(c.x % 3);
  }
  const freeSubSlotAt = (col: number): number | null => {
    const slots = occupiedByCol.get(col);
    if (!slots) {
      return 0;
    }
    for (let sub = 0; sub < 3; sub++) {
      if (!slots.has(sub)) {
        return sub;
      }
    }
    return null;
  };
  const requestedFree = freeSubSlotAt(requestedCol);
  if (requestedFree != null) {
    return requestedCol * 3 + requestedFree;
  }
  for (let step = 1; step < 32; step++) {
    for (const dir of [1, -1]) {
      const col = requestedCol + step * dir;
      if (col < 0) {
        continue;
      }
      const free = freeSubSlotAt(col);
      if (free != null) {
        return col * 3 + free;
      }
    }
  }
  return requestedCol * 3;
}

/**
 * Zone commands for one seat: moves, library management, dumps and reveals.
 * Undefined until the game id is known.
 *
 * `move` is the one optimistic command here. A single known public card is
 * moved in Datatrice before Command_MoveCard is sent and rolled back if the
 * server rejects it; the listener consumes the pending marker when the echo
 * arrives (cardMovedInSameZone is idempotent; cardMovedBetweenZones is
 * deduplicated). Hidden-zone sources, batches, unknown cards and tokens
 * leaving the battlefield wait for the server instead.
 */
export function usePlayerZoneCommands(playerId: number): PlayerZoneCommands | undefined {
  const gameId = useGameId();
  const webClient = useWebClient();
  const dispatch = useAppDispatch();
  // Snapshot reads for rollback closures and drop resolution; reactive reads
  // stay on selectors in usePlayerSeatViewModel.
  const store = useStore<RootState>();

  return useMemo(() => {
    if (gameId == null) {
      return undefined;
    }
    const game = webClient.request.game;

    const move = (baseParams: MoveCardParams) => {
      let params = baseParams;
      if (baseParams.targetZone === ZoneName.TABLE) {
        const targetBattlefield = games.Selectors.getZone(
          store.getState(),
          gameId,
          baseParams.targetPlayerId,
          ZoneName.TABLE,
        );
        if (targetBattlefield) {
          params = { ...baseParams, x: resolveBattlefieldDropX(baseParams, targetBattlefield) };
        }
      }

      const { startPlayerId, startZone, cardsToMove, targetPlayerId, targetZone, x, y } = params;

      // Hidden zones (library, sideboard) address cards by position, so the
      // real identity only arrives with Event_MoveCard.
      const cardIdsFromParams = cardsToMove?.card ?? [];
      const isHiddenSource = startZone === ZoneName.DECK || startZone === ZoneName.SIDEBOARD;
      if (isHiddenSource || cardIdsFromParams.length !== 1) {
        game.moveCard(gameId, params);
        return;
      }

      const cardId = cardIdsFromParams[0].cardId;
      const sourceZoneEntry = games.Selectors.getZone(store.getState(), gameId, startPlayerId, startZone);
      const sourceCard = sourceZoneEntry?.byId[cardId];
      const sourceIndex = sourceZoneEntry?.order.indexOf(cardId) ?? -1;
      if (!sourceCard || sourceIndex < 0) {
        game.moveCard(gameId, params);
        return;
      }

      // Tokens get Event_DestroyCard, not Event_MoveCard, when they leave the
      // battlefield. An optimistic TABLE → GRAVE would strand them in GRAVE
      // because the destroy event then finds nothing on TABLE.
      const leavingBattlefield = startZone === ZoneName.TABLE && targetZone !== ZoneName.TABLE;
      if (sourceCard.destroyOnZoneChange && leavingBattlefield) {
        game.moveCard(gameId, params);
        return;
      }

      const sameZone = startPlayerId === targetPlayerId && startZone === targetZone;
      const isPositionalReorderZone =
        targetZone === ZoneName.HAND
        || targetZone === ZoneName.STACK
        || targetZone === ZoneName.GRAVE
        || targetZone === ZoneName.EXILE;

      // Leaving the battlefield resets transient state like desktop's
      // CardItem::resetState (server_card.cpp:51); the server doesn't
      // broadcast the wipe for a same-id move. The stack keeps annotations
      // (`keepAnnotations = (targetzone == STACK)`, server_abstract_player.cpp:429).
      const optimisticCard = leavingBattlefield
        ? {
          ...sourceCard,
          x, y,
          tapped: false,
          attacking: false,
          doesntUntap: false,
          pt: '',
          color: '',
          annotation: targetZone === ZoneName.STACK ? sourceCard.annotation : '',
          counterList: [],
        }
        : { ...sourceCard, x, y };
      const opKey = games.moveOpKey(startPlayerId, cardId);

      if (sameZone && isPositionalReorderZone) {
        dispatch(games.Actions.cardMovedInSameZone({
          gameId,
          playerId: startPlayerId,
          zoneName: startZone,
          cardId,
          toIndex: x,
          card: optimisticCard,
        }));
        games.beginOptimistic(opKey, () => {
          dispatch(games.Actions.cardMovedInSameZone({
            gameId,
            playerId: startPlayerId,
            zoneName: startZone,
            cardId,
            toIndex: sourceIndex,
            card: sourceCard,
          }));
        });
      } else {
        // Cross-zone move or a battlefield re-slot.
        dispatch(games.Actions.cardMovedBetweenZones({
          gameId,
          fromPlayerId: startPlayerId,
          fromZone: startZone,
          fromCardId: cardId,
          toPlayerId: targetPlayerId,
          toZone: targetZone,
          card: optimisticCard,
        }));
        games.beginOptimistic(opKey, () => {
          dispatch(games.Actions.cardMovedBetweenZones({
            gameId,
            fromPlayerId: targetPlayerId,
            fromZone: targetZone,
            fromCardId: cardId,
            toPlayerId: startPlayerId,
            toZone: startZone,
            card: sourceCard,
          }));
        });
      }

      game.moveCard(gameId, params, undefined, {
        onError: (responseCode) => {
          console.warn(`Command_MoveCard rejected with code ${responseCode}; rolling back cardId ${cardId}`);
          games.rollbackOptimistic(opKey);
        },
      });
    };

    // Command_RevealCards. "All players" OMITS player_id: Servatrice checks
    // has_player_id() (server_abstract_player.cpp:1476) and treats an explicit
    // -1 as an unknown player. Random uses the single -2 card id
    // (server_abstract_player.cpp:1498-1508); top-N sends top_cards plus the
    // `card_id: [0]` desktop keeps for old servers (player_actions.cpp:1745).
    const reveal = (zoneName: string, to: RevealRecipient, cards: RevealSelection = 'zone') => {
      const params: { zoneName: string; topCards?: number; cardId?: number[]; playerId?: number } = { zoneName };
      if (cards === 'random') {
        params.cardId = [RANDOM_CARD_FROM_ZONE];
      } else if (cards !== 'zone') {
        params.topCards = cards.top;
        params.cardId = [0];
      }
      if (to !== 'all') {
        params.playerId = to;
      }
      game.revealCards(gameId, params);
    };

    const clearView = (zoneName: string) => {
      dispatch(games.Actions.zoneViewCleared({ gameId, playerId, zoneName }));
    };

    return {
      move,
      draw: (count) => game.drawCards(gameId, { number: count }),
      // Command_UndoDraw has no payload (player_actions.cpp:371-374).
      undoDraw: () => game.undoDraw(gameId),
      mulligan: (handSize) => game.mulligan(gameId, { number: handSize }),
      // Inclusive positions; negative counts from the bottom
      // (player_actions.cpp:267-268, 298-299).
      shuffleLibrary: (range = { start: 0, end: -1 }) =>
        game.shuffle(gameId, { zoneName: ZoneName.DECK, start: range.start, end: range.end }),
      // Response_DumpZone lands in `revealedCards`; desktop actViewTopCards /
      // actViewBottomCards (player_actions.cpp:182-197).
      viewLibrary: (count, fromBottom) =>
        game.dumpZone(gameId, { playerId, zoneName: ZoneName.DECK, numberCards: count, isReversed: fromBottom }),
      // Re-opening re-dumps fresh, like desktop's zoneViewCleared on close.
      closeLibraryView: () => clearView(ZoneName.DECK),
      // The sideboard is a HiddenZone too; -1 dumps all of it.
      viewSideboard: () =>
        game.dumpZone(gameId, { playerId, zoneName: ZoneName.SIDEBOARD, numberCards: -1, isReversed: false }),
      closeSideboardView: () => clearView(ZoneName.SIDEBOARD),
      reveal,
      // grant_write_access adds the target to the zone's write set
      // (server_abstract_player.cpp:1566) until the next shuffle; desktop
      // actLendLibrary (player_actions.cpp:1723-1733).
      lendLibrary: (to) =>
        game.revealCards(gameId, { zoneName: ZoneName.DECK, playerId: to, grantWriteAccess: true }),
      // Desktop actAlwaysReveal / actAlwaysLookAt (player_actions.cpp:199-215).
      setAlwaysRevealTopCard: (value) =>
        game.changeZoneProperties(gameId, { zoneName: ZoneName.DECK, alwaysRevealTopCard: value }),
      setAlwaysLookAtTopCard: (value) =>
        game.changeZoneProperties(gameId, { zoneName: ZoneName.DECK, alwaysLookAtTopCard: value }),
    };
  }, [gameId, webClient, dispatch, store, playerId]);
}
