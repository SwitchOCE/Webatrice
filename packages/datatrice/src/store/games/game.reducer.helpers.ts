import type { ZoneNameValue } from '@cockatrice/sockatrice';
import { create, isFieldSet } from '@bufbuild/protobuf';
import { Enriched } from '../../types';
import {
  CardAttribute,
  Event_AttachCard,
  Event_CreateToken,
  Event_GameStateChanged,
  Event_GameStateChangedSchema,
  ServerInfo_Arrow,
  ServerInfo_Card,
  ServerInfo_CardCounter,
  ServerInfo_CardCounterSchema,
  ServerInfo_CardSchema,
  ServerInfo_Counter,
  ServerInfo_Player,
} from '@cockatrice/sockatrice/generated';
import { cloneWith } from '../../common';
import type { LogEntry } from './messageLog';

export const MAX_GAME_MESSAGES = 1000;

const LEAVE_REASON_MESSAGES: Record<number, string> = {
  1: 'reason unknown',
  2: 'kicked by game host or moderator',
  3: 'player left the game',
  4: 'player disconnected from server',
};

export function formatLeaveMessage(playerName: string, reason: number): LogEntry {
  const reasonText = LEAVE_REASON_MESSAGES[reason] ?? LEAVE_REASON_MESSAGES[1];
  return {
    text: `${playerName} has left the game (${reasonText}).`,
    segments: [
      { text: playerName, kind: 'player' },
      { text: ` has left the game (${reasonText}).`, kind: 'plain' },
    ],
  };
}

export function eventTimestamp(): number {
  return Date.now();
}

/**
 * The game time at wall-clock `now`: the server's last count plus the whole seconds since it
 * arrived. Live game events carry no game time (Servatrice stamps `seconds_elapsed` only on the
 * containers it records), so desktop runs its own clock from the last Event_GameStateChanged and
 * reads it as it logs each line (MessageLogWidget::getCurrentTime); this does the same.
 */
export function gameSecondsNow(game: Enriched.GameEntry, now: number): number {
  if (game.secondsElapsedAt === undefined) {
    return game.secondsElapsed;
  }
  return game.secondsElapsed + Math.max(0, Math.floor((now - game.secondsElapsedAt) / 1000));
}

/**
 * Push a formatted game event onto the log. Accepts a plain string for
 * legacy paths (chat, ad-hoc system messages) or a `LogEntry` from the
 * `formatX(...)` helpers — the latter carries per-token segments so
 * the chat renderer can highlight card names / player names / numbers.
 */
export function pushEventMessage(
  game: Enriched.GameEntry,
  playerId: number,
  message: string | LogEntry | null | undefined,
): void {
  if (!message) {
    return;
  }
  const text = typeof message === 'string' ? message : message.text;
  const segments = typeof message === 'string' ? undefined : message.segments;
  if (!text) {
    return;
  }
  if (game.messages.length >= MAX_GAME_MESSAGES) {
    game.messages = game.messages.slice(game.messages.length - MAX_GAME_MESSAGES + 1);
  }
  const now = eventTimestamp();
  game.messages.push({
    playerId,
    message: text,
    segments,
    timeReceived: now,
    gameSeconds: gameSecondsNow(game, now),
    kind: 'event',
  });
}

export function normalizePlayers(playerList: ServerInfo_Player[]): { [playerId: number]: Enriched.PlayerEntry } {
  const players: { [playerId: number]: Enriched.PlayerEntry } = {};
  for (const player of playerList) {
    const playerId = player.properties.playerId;

    const zones: { [zoneName: string]: Enriched.ZoneEntry } = {};
    for (const zone of player.zoneList) {
      const order: number[] = [];
      const byId: { [id: number]: ServerInfo_Card } = {};
      for (const card of zone.cardList) {
        order.push(card.id);
        byId[card.id] = card;
      }
      zones[zone.name] = {
        name: zone.name as ZoneNameValue,
        type: zone.type,
        withCoords: zone.withCoords,
        cardCount: zone.cardCount,
        order,
        byId,
        alwaysRevealTopCard: zone.alwaysRevealTopCard,
        alwaysLookAtTopCard: zone.alwaysLookAtTopCard,
      };
    }

    const counters: { [counterId: number]: ServerInfo_Counter } = {};
    for (const counter of player.counterList) {
      counters[counter.id] = counter;
    }

    const arrows: { [arrowId: number]: ServerInfo_Arrow } = {};
    for (const arrow of player.arrowList) {
      arrows[arrow.id] = arrow;
    }

    players[playerId] = {
      properties: player.properties,
      deckList: player.deckList,
      zones,
      counters,
      arrows,
      drawSeq: 0,
      lastDrawCount: 0,
    };
  }
  return players;
}

export function buildEmptyCard(
  id: number,
  name: string,
  x: number,
  y: number,
  faceDown: boolean,
  providerId: string
): ServerInfo_Card {
  return create(ServerInfo_CardSchema, {
    id, name, x, y, faceDown,
    tapped: false, attacking: false, color: '', pt: '', annotation: '',
    destroyOnZoneChange: false, doesntUntap: false, counterList: [],
    attachPlayerId: -1, attachZone: '', attachCardId: -1, providerId,
  });
}

// Port of Cockatrice's `Server_Card::resetState(bool keepAnnotations)`
// (server_card.cpp:51-61). Wipes battlefield-only transient state when
// a card leaves the table. Servatrice keeps annotations ONLY when the
// target zone is the STACK — `keepAnnotations = (targetzone->getName()
// == ZoneNames::STACK)` at the call site in
// server_abstract_player.cpp:429. Every other non-battlefield target
// (hand, deck, graveyard, exile) clears them.
export function resetCardState(
  card: ServerInfo_Card,
  keepAnnotations: boolean = false,
): ServerInfo_Card {
  return cloneWith(ServerInfo_CardSchema, card, {
    tapped: false,
    attacking: false,
    doesntUntap: false,
    pt: '',
    color: '',
    annotation: keepAnnotations ? card.annotation : '',
    counterList: [],
  });
}

// Drops a zone's known-card tracking — the revealed identities (`byId`/`order`), any open
// "View library" snapshot, and the auto-revealed top-card face — while preserving the
// authoritative `cardCount`. Used when a shuffle randomizes a hidden zone: any previously-
// known card positions are now meaningless, so the client must stop rendering a stale top
// card or leaking cards moved in before the shuffle. If auto-reveal is still on, Servatrice
// re-emits Event_RevealCards immediately after the shuffle (revealTopCardIfNeeded at
// server_abstract_player.cpp:329-333) and the cardsRevealed reducer re-populates
// topRevealedCard with the new top — so the pile briefly flashes blank and then repopulates.
export function clearZoneKnownCards(zone: Enriched.ZoneEntry): void {
  zone.order = [];
  zone.byId = {};
  delete zone.revealedCards;
  delete zone.topRevealedCard;
}

// The fields an Event_SetCardAttr sets; booleans arrive as '0' / '1'. An attribute
// without a card field yields undefined: the event still logs but changes nothing.
export function cardAttrFields(attribute: CardAttribute, attrValue: string): Partial<ServerInfo_Card> | undefined {
  switch (attribute) {
    case CardAttribute.AttrTapped:
      return { tapped: attrValue === '1' };
    case CardAttribute.AttrAttacking:
      return { attacking: attrValue === '1' };
    case CardAttribute.AttrFaceDown:
      return { faceDown: attrValue === '1' };
    case CardAttribute.AttrColor:
      return { color: attrValue };
    case CardAttribute.AttrPT:
      return { pt: attrValue };
    case CardAttribute.AttrAnnotation:
      return { annotation: attrValue };
    case CardAttribute.AttrDoesntUntap:
      return { doesntUntap: attrValue === '1' };
    default:
      return undefined;
  }
}

// Event_SetCardCounter sets an absolute value: zero or less removes the counter,
// otherwise it is updated in place or appended.
export function mergeCardCounter(
  counterList: ServerInfo_CardCounter[],
  counterId: number,
  counterValue: number,
): ServerInfo_CardCounter[] {
  if (counterValue <= 0) {
    return counterList.filter(c => c.id !== counterId);
  }
  const idx = counterList.findIndex(c => c.id === counterId);
  if (idx < 0) {
    return [...counterList, create(ServerInfo_CardCounterSchema, { id: counterId, value: counterValue })];
  }
  return counterList.map((c, i) => (i === idx ? cloneWith(ServerInfo_CardCounterSchema, c, { value: counterValue }) : c));
}

// Unattach is an Event_AttachCard with an empty targetZone (proto3 can't tell the
// unset numerics from player 0 / card 0), written as the explicit -1 / '' / -1
// sentinels `isAttachedChild` checks for.
// See .github/instructions/datatrice-game.instructions.md#servatrice-game-event-quirks.
export function cardAttachFields(data: Event_AttachCard): Pick<ServerInfo_Card, 'attachPlayerId' | 'attachZone' | 'attachCardId'> {
  const { targetPlayerId, targetZone, targetCardId } = data;
  return targetZone
    ? { attachPlayerId: targetPlayerId, attachZone: targetZone, attachCardId: targetCardId }
    : { attachPlayerId: -1, attachZone: '', attachCardId: -1 };
}

// Builds the token through the schema so fields the wire omits start at the protocol's
// documented defaults, with the attach sentinels set so the token lands detached.
export function buildTokenCard(data: Event_CreateToken): ServerInfo_Card {
  const { cardId, cardName, x, y, faceDown, color, pt, annotation, destroyOnZoneChange, cardProviderId } = data;
  return create(ServerInfo_CardSchema, {
    id: cardId, name: cardName, x, y, faceDown,
    tapped: false, attacking: false, color, pt, annotation, destroyOnZoneChange,
    doesntUntap: false, counterList: [],
    attachPlayerId: -1, attachZone: '', attachCardId: -1, providerId: cardProviderId,
  });
}

// A gameStateChanged resync rebuilds every player from the wire, which omits two
// things the client already holds: `userInfo` (Servatrice resyncs with
// withUserInfo=false, server_game.cpp:280) and any open "View library" snapshot
// (`revealedCards` is local-only). Copies both from `previous` into the freshly
// normalized `next` in place (it is fresh from normalizePlayers, so nothing else holds
// it), so names and open zone views survive a mid-game resync.
// See .github/instructions/datatrice-game.instructions.md#servatrice-game-event-quirks.
export function carryForwardResyncState(
  previous: { [playerId: number]: Enriched.PlayerEntry },
  next: { [playerId: number]: Enriched.PlayerEntry },
): void {
  for (const idStr of Object.keys(next)) {
    const id = Number(idStr);
    const prevPlayer = previous[id];
    const prevUserInfo = prevPlayer?.properties.userInfo;
    if (prevUserInfo && !next[id].properties.userInfo) {
      next[id].properties.userInfo = prevUserInfo;
    }
    if (prevPlayer) {
      for (const zoneName of Object.keys(next[id].zones)) {
        const prevRevealed = prevPlayer.zones[zoneName]?.revealedCards;
        if (prevRevealed) {
          next[id].zones[zoneName].revealedCards = prevRevealed;
        }
      }
    }
  }
}

export interface GameInfoUpdate {
  gameStarted?: boolean;
  activePlayerId?: number;
  activePhase?: number;
  secondsElapsed?: number;
}

// The game-level fields an Event_GameStateChanged actually carries, or null when it
// carries none. isFieldSet tells "set" from "default";
// see .github/instructions/datatrice-store.instructions.md#reducer-author-hazards.
export function gameInfoUpdateFrom(data: Event_GameStateChanged): GameInfoUpdate | null {
  const { field } = Event_GameStateChangedSchema;
  const update: GameInfoUpdate = {};
  if (isFieldSet(data, field.gameStarted)) {
    update.gameStarted = data.gameStarted;
  }
  if (isFieldSet(data, field.activePlayerId)) {
    update.activePlayerId = data.activePlayerId;
  }
  if (isFieldSet(data, field.activePhase)) {
    update.activePhase = data.activePhase;
  }
  if (isFieldSet(data, field.secondsElapsed)) {
    update.secondsElapsed = data.secondsElapsed;
  }
  return Object.keys(update).length > 0 ? update : null;
}
