import type {
  Event_RoomSay,
  ServerInfo_Arrow,
  ServerInfo_Card,
  ServerInfo_ChatMessage,
  ServerInfo_Counter,
  ServerInfo_Game,
  ServerInfo_PlayerProperties,
  ServerInfo_Room,
  ServerInfo_User,
} from '@cockatrice/sockatrice/generated';
import type { ZoneNameValue } from '@cockatrice/sockatrice';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';

// @critical `info` is the wire snapshot; repeated collections on it go stale. Read normalized siblings.
// See .github/instructions/datatrice-store.instructions.md#data-structure-invariants.

export interface GametypeMap { [index: number]: string }

export interface Room {
  info: ServerInfo_Room;
  gametypeMap: GametypeMap;
  order: number;
  games: { [gameId: number]: Game };
  users: { [userName: string]: ServerInfo_User };
}

export interface Game {
  info: ServerInfo_Game;
  gameType: string;
}

// A line the client itself appends to a chat, as desktop does with
// ChatView::appendMessage (e.g. TabRoom::sayFinished's flood warning). The UI
// renders the text for the kind; the line carries no sender and no wire text.
// `notSent`: the server never answered the message (see Message.failure).
export type ChatNotice = 'chatFlood' | 'notSent';

export type Message = Event_RoomSay & {
  timeReceived: number;
  // Stable, monotonic client id assigned at store ingestion; absent on the
  // wire-derived message before it's stored. See rooms.reducer.inline.ts for the
  // rationale (chat rows key on it, not the array index).
  id?: number;
  // Set only on client-generated lines; see ChatNotice.
  notice?: ChatNotice;
  // Why a `notSent` line's message got no answer.
  failure?: WebsocketTypes.CommandFailure;
};

// @critical `info` = wire snapshot at join time; top-level twins hold live values updated by game events.
// See .github/instructions/datatrice-store.instructions.md#data-structure-invariants.
export interface GameEntry {
  info: ServerInfo_Game;

  hostId: number;
  localPlayerId: number;
  spectator: boolean;
  judge: boolean;
  resuming: boolean;

  started: boolean;
  activePlayerId: number;
  activePhase: number;
  secondsElapsed: number;
  reversed: boolean;

  players: { [playerId: number]: PlayerEntry };
  // Player ids in server/seat (join) order. `players` is a numeric-keyed map, so
  // its iteration order is ascending playerId, not seat order — this preserves the
  // order the server sent (full-state syncs) and append-on-join, for board seating
  // and reveal-target lists. See seatedPlayersOf / Selectors.getSeatedPlayers.
  seatOrder: number[];
  // No ping field here by design: the live ping clock lives out of the game
  // graph in GamesState.pings — read it via Selectors.getPings / getPlayerPing.
  messages: GameMessage[];
  // Local replay playback (desktop TabGame in replay mode), never a server game:
  // rebuilt from a GameReplay's event containers under a client-chosen id, kept
  // across disconnects, and excluded from the active-game selectors.
  replay?: boolean;
}

export interface PlayerEntry {
  properties: ServerInfo_PlayerProperties;
  deckList: string;
  zones: { [zoneName: string]: ZoneEntry };
  counters: { [counterId: number]: ServerInfo_Counter };
  arrows: { [arrowId: number]: ServerInfo_Arrow };
  // Last-draw beacon. `drawSeq` increments on every `Event_DrawCards`
  // (i.e. when Command_DrawCards / Command_Mulligan resolves).
  // `lastDrawCount` records how many cards that event drew.
  // Consumers can watch `drawSeq` to trigger a draw-flight animation
  // and read `lastDrawCount` to know how many flights to spawn — the
  // signal is scoped to actual draws and never fires for cards moved
  // into hand by other means (drag, return-to-hand, etc.).
  drawSeq: number;
  lastDrawCount: number;
}

export interface ZoneEntry {
  name: ZoneNameValue;
  type: number;
  withCoords: boolean;
  // Hidden zones: cardCount may exceed order.length.
  cardCount: number;
  order: number[];
  byId: { [cardId: number]: ServerInfo_Card };
  alwaysRevealTopCard: boolean;
  alwaysLookAtTopCard: boolean;
  // Transient dump-zone view (e.g. "View library"): the face-up card list returned by
  // Response_DumpZone. Kept apart from byId/order because HiddenZone dumps reference cards
  // by list index (0..N-1), which would collide with real card ids. Cleared when the view closes.
  // For a reversed dump (bottom-N view), card ids run (cardCount-N)..(cardCount-1) matching
  // the actual deck positions; for a top-N view, ids run 0..(N-1). Mirrors Cockatrice's
  // ZoneViewZoneLogic::updateCardIds (view_zone_logic.cpp:92-124).
  revealedCards?: ServerInfo_Card[];
  // Whether the transient dump-zone view was requested with is_reversed=true
  // (bottom-N). Undefined when no view is active. Used by the reducers to
  // translate between deck positions (what Event_MoveCard carries) and
  // reveal-array indices (what revealedCards uses).
  revealedIsReversed?: boolean;
  // Persistent "top card is currently visible" state for HiddenZone piles
  // whose owner has always_reveal_top_card OR always_look_at_top_card
  // toggled on. Populated by cardsRevealed when the auto-reveal from
  // Servatrice's revealTopCardIfNeeded (server_abstract_player.cpp:553-580)
  // fires — either broadcast to everyone (always-reveal) or private to the
  // owner (always-look-at). Cleared by zonePropertiesChanged when both
  // flags go false. Consumers render the face on the pile only when the
  // matching visibility flag is still on for the viewer.
  topRevealedCard?: ServerInfo_Card | null;
}

export interface GameMessage {
  playerId: number;
  message: string;
  /** Optional per-token segments — populated by the `formatX(...)`
   *  helpers for event lines so the chat renderer can color card /
   *  player / number tokens independently. Chat lines and pre-segment
   *  legacy events leave this undefined. */
  segments?: LogMessageSegment[];
  /** Wall-clock ms when the reducer processed this message. Rendered
   *  as `[HH:MM:SS]` local time before the message body, matching
   *  Cockatrice desktop's `QDateTime::currentDateTime()` stamp. */
  timeReceived: number;
  kind?: 'chat' | 'event';
  /** Chat lines only: the sender's name when the line arrived, so the line
   *  keeps its author after that player leaves (desktop ChatView stores the
   *  sender with each message). Undefined when the seat was unknown. */
  senderName?: string;
}

export type LogMessageSegmentKind = 'plain' | 'player' | 'card' | 'number';
export interface LogMessageSegment {
  text: string;
  kind: LogMessageSegmentKind;
}

export interface LogGroups {
  room: ServerInfo_ChatMessage[];
  game: ServerInfo_ChatMessage[];
  chat: ServerInfo_ChatMessage[];
}
