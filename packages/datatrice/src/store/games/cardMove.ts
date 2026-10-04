import { ZoneName } from '@cockatrice/sockatrice';
import { Enriched } from '../../types';
import { Event_MoveCard, ServerInfo_Card, ServerInfo_CardSchema } from '@cockatrice/sockatrice/generated';
import { cloneWith } from '../../common';
import type { GamesState } from './game.interfaces';
import { buildEmptyCard, resetCardState } from './game.reducer.helpers';
import { formatCardMoved, formatCardUndoneDraw, type LogEntry } from './messageLog';

// Pure planning for the `cardMoved` listener (game.listeners.zones.ts). Event_MoveCard
// drives six jobs: identity, placement plus optimistic bookkeeping, open zone-view
// sync, the orphan-arrow sweep (arrowsTouchingCard), attachment
// reparenting and the log line. Each planner reads the pre-move state it is given
// and returns data; the listener turns that into primitive actions.

/** Which card an Event_MoveCard moves, and where to. */
export interface MoveIdentity {
  /** `targetZone`, or `startZone` when the event leaves it empty. */
  targetZone: string;
  /** The card changes (player, zone). Cross-player TABLE→TABLE counts. */
  crossesZones: boolean;
  /** The card's id in the source zone: the event's, else the one at `position`; -1 when unknown. */
  cardId: number;
  /** The card's id after the move: `newCardId`, else the source id. */
  newCardId: number;
  /** The source zone's entry for the card, when the client holds one. */
  sourceCard?: ServerInfo_Card;
  /** Neither the event nor the client knows the card (an opponent's hidden zones). */
  hidden: boolean;
}

export function resolveMoveIdentity(sourceZone: Enriched.ZoneEntry, data: Event_MoveCard): MoveIdentity {
  const { cardId, startPlayerId, startZone, position, targetPlayerId, newCardId } = data;
  const targetZone = data.targetZone || startZone;

  let resolvedCardId = -1;
  if (cardId >= 0) {
    resolvedCardId = cardId;
  } else if (position >= 0 && position < sourceZone.order.length) {
    resolvedCardId = sourceZone.order[position];
  }
  const sourceCard = resolvedCardId >= 0 ? sourceZone.byId[resolvedCardId] : undefined;

  return {
    targetZone,
    crossesZones: startPlayerId !== targetPlayerId || startZone !== targetZone,
    cardId: resolvedCardId,
    newCardId: newCardId >= 0 ? newCardId : resolvedCardId,
    sourceCard,
    hidden: resolvedCardId < 0 && newCardId < 0,
  };
}

/**
 * The card as it lands: the source entry carrying the event's fields, or a blank card
 * when the client never saw it. Leaving the battlefield wipes transient state like
 * desktop's CardItem::resetState(); STACK keeps annotations, as Servatrice passes
 * `keepAnnotations = (targetzone == STACK)` (server_abstract_player.cpp:429).
 */
export function buildMovedCard(move: MoveIdentity, data: Event_MoveCard): ServerInfo_Card {
  const { cardName, x, y, faceDown, newCardProviderId } = data;
  const { sourceCard } = move;
  const card = sourceCard
    ? cloneWith(ServerInfo_CardSchema, sourceCard, {
      id: move.newCardId,
      name: cardName || sourceCard.name,
      x, y, faceDown,
      providerId: newCardProviderId || sourceCard.providerId,
      counterList: [...sourceCard.counterList],
    })
    : buildEmptyCard(move.newCardId, cardName, x, y, faceDown, newCardProviderId ?? '');

  const leavesBattlefield = data.startZone === ZoneName.TABLE && move.targetZone !== ZoneName.TABLE;
  return leavesBattlefield ? resetCardState(card, move.targetZone === ZoneName.STACK) : card;
}

const POSITIONAL_REORDER_ZONES: readonly string[] = [ZoneName.HAND, ZoneName.STACK, ZoneName.GRAVE, ZoneName.EXILE];

/**
 * How the move lands in the store:
 * - `count-transfer`: a hidden card changes zones; only the two `cardCount`s shift.
 * - `none`: a hidden card "moves" within its zone, which is unrepresentable.
 * - `view-reorder`: the card moves within a zone that has an open zone-view snapshot.
 *   Servatrice hides card_id for a bottom-view drag past `cardsBeingLookedAt`
 *   (server_cardzone.cpp:187-190), but `position` and `x` still index the snapshot.
 * - `same-zone`: an ordered zone reorder (idempotent, safe over an optimistic pre-dispatch).
 * - `between-zones`: everything else, table repositions included.
 */
export type MovePlacement = 'count-transfer' | 'none' | 'view-reorder' | 'same-zone' | 'between-zones';

export function planMovePlacement(
  move: MoveIdentity,
  sourceZone: Enriched.ZoneEntry,
  data: Event_MoveCard,
): MovePlacement {
  const inOpenView = !move.crossesZones && !!sourceZone.revealedCards && data.position >= 0;
  if (inOpenView) {
    return 'view-reorder';
  }
  if (move.hidden) {
    return move.crossesZones ? 'count-transfer' : 'none';
  }
  if (!move.crossesZones && POSITIONAL_REORDER_ZONES.includes(move.targetZone) && move.cardId >= 0) {
    return 'same-zone';
  }
  return 'between-zones';
}

/**
 * Server echo of a cross-zone move the client already applied optimistically, under
 * the source id. The target zone (read after the optimistic dispatch) may need:
 * - `migrate`: the server gave the card a fresh id (cross-player TABLE→TABLE). Re-key the
 *   optimistic entry, keeping its client-only fields: the source entry is gone, so
 *   `movedCard` fell back to a blank card, and Servatrice never re-sends an "Owner:"
 *   annotation on a return trip. Without the re-key, later Command_CreateArrow calls send
 *   the stale id and fail with RespNameNotFound.
 * - `patch`: the server corrected the position (the next free stack sub-slot).
 */
export type OptimisticReconcile =
  | { kind: 'migrate'; card: ServerInfo_Card }
  | { kind: 'patch'; fields: Pick<ServerInfo_Card, 'x' | 'y' | 'faceDown'> };

export function planOptimisticReconcile(
  targetZone: Enriched.ZoneEntry | undefined,
  optimisticId: number,
  movedCard: ServerInfo_Card,
): OptimisticReconcile | null {
  if (!targetZone) {
    return null;
  }
  const serverId = movedCard.id;
  const optimisticCard = targetZone.byId[optimisticId];
  if (serverId !== optimisticId && optimisticCard !== undefined && targetZone.byId[serverId] === undefined) {
    return {
      kind: 'migrate',
      card: cloneWith(ServerInfo_CardSchema, optimisticCard, {
        id: serverId,
        x: movedCard.x,
        y: movedCard.y,
        faceDown: movedCard.faceDown,
        name: movedCard.name || optimisticCard.name,
        providerId: movedCard.providerId || optimisticCard.providerId,
      }),
    };
  }
  if (targetZone.byId[serverId]) {
    return { kind: 'patch', fields: { x: movedCard.x, y: movedCard.y, faceDown: movedCard.faceDown } };
  }
  return null;
}

/**
 * Keeps open zone views and the pile's top-card face in step with a move, mirroring
 * desktop's live ZoneViewZoneLogic:
 * - `removeAt`: the card left a viewed zone; prune it at the event's `position`.
 * - `clearTop`: the top of a library moved. If auto-reveal is on, Servatrice re-emits
 *   Event_RevealCards right after (server_abstract_player.cpp:329-333) and the
 *   cardsRevealed reducer restores the face.
 * - `insertAt`: the card arrived in a viewed zone; splice it in at `x`.
 */
export interface ZoneViewSync {
  removeAt?: number;
  clearTop: boolean;
  insertAt?: number;
}

export function planZoneViewSync(
  move: MoveIdentity,
  sourceZone: Enriched.ZoneEntry,
  targetZone: Enriched.ZoneEntry,
  data: Event_MoveCard,
): ZoneViewSync {
  const { position, startZone, x } = data;
  return {
    removeAt: sourceZone.revealedCards && move.crossesZones && position >= 0 ? position : undefined,
    clearTop: position === 0 && startZone === ZoneName.DECK,
    insertAt: targetZone.revealedCards && move.crossesZones ? x : undefined,
  };
}

/**
 * Servatrice discards a card's arrows when it changes zones without emitting
 * Event_DeleteArrow, so the client sweeps them. A same-player reposition keeps them; a
 * cross-player TABLE→TABLE move does not (the card gets a fresh id, and a stale arrow
 * would fail Servatrice's duplicate-arrow check on the next one).
 */
export function sweepsArrows(move: MoveIdentity): boolean {
  return move.cardId >= 0 && move.crossesZones;
}

/** An arrow by owner: arrows live on the player who drew them. */
export interface ArrowRef {
  ownerPlayerId: number;
  arrowId: number;
}

/**
 * Every arrow, on any player (arrows cross players), with an endpoint on the given card.
 * A state scan for the sweep, read once per move after the move lands; not a selector,
 * since it allocates a fresh array on every call.
 */
export function arrowsTouchingCard(
  games: GamesState,
  gameId: number,
  playerId: number,
  zoneName: string,
  cardId: number,
): ArrowRef[] {
  const refs: ArrowRef[] = [];
  for (const [ownerId, owner] of Object.entries(games.games[gameId]?.players ?? {})) {
    for (const arrow of Object.values(owner.arrows)) {
      const fromCard = arrow.startPlayerId === playerId && arrow.startZone === zoneName && arrow.startCardId === cardId;
      const toCard = arrow.targetPlayerId === playerId && arrow.targetZone === zoneName && arrow.targetCardId === cardId;
      if (fromCard || toCard) {
        refs.push({ ownerPlayerId: Number(ownerId), arrowId: arrow.id });
      }
    }
  }
  return refs;
}

/**
 * Servatrice skips the unattach for TABLE→TABLE moves and gives a cross-player card a
 * new id (server_abstract_player.cpp:376, :449), so its attached children are re-pointed.
 */
export function planAttachmentReparent(
  move: MoveIdentity,
  data: Event_MoveCard,
): { fromPlayerId: number; fromCardId: number; toPlayerId: number; toCardId: number } | null {
  if (move.cardId < 0 || data.startZone !== ZoneName.TABLE || move.targetZone !== ZoneName.TABLE) {
    return null;
  }
  return {
    fromPlayerId: data.startPlayerId,
    fromCardId: move.cardId,
    toPlayerId: data.targetPlayerId,
    toCardId: move.newCardId,
  };
}

/** Undo-draw replaces the move line with desktop's "X undoes their last draw" (logUndoDraw). */
export function cardMovedLogEntry(
  game: Enriched.GameEntry,
  playerId: number,
  data: Event_MoveCard,
  move: MoveIdentity,
  isUndoDraw: boolean,
): LogEntry | null {
  const knownName = move.sourceCard?.name;
  if (isUndoDraw) {
    return formatCardUndoneDraw(game, playerId, knownName ?? data.cardName ?? '');
  }
  return formatCardMoved(game, playerId, { ...data, targetZone: move.targetZone }, { resolvedCardName: knownName ?? '' });
}
