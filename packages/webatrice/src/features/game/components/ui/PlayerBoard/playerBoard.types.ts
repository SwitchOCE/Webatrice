// The seat contract: what a player's board shows (PlayerBoardModel) and what it
// can ask for (PlayerBoardCommands). GameBoardCell builds the model from
// Datatrice state (usePlayerSeatViewModel) and the commands from the WebClient
// (usePlayer*Commands); views receive only these interfaces, never selectors or
// request builders. See docs/webatrice-solid-refactor-plan.md §5 (PB-01).
//
// Type-only: this module must not construct requests.

import type { ZoneNameValue } from '@cockatrice/sockatrice';
import type { MoveCardParams } from '@cockatrice/sockatrice/generated';
import type { ColorRGBA } from '@app/types';

import type { BattlefieldSlot } from '../../battlefield/Battlefield/battlefieldLayout';

/** One card in a pile, the hand, the stack or a revealed-zone snapshot. `id` is the
 *  server card id as a string; for hidden-zone snapshots it is the position the
 *  server reported. */
export interface PlayerCardViewModel {
  id: string;
  name: string;
  scryfallId: string;
  /** Server-set annotation. Only the stack keeps one when a card leaves the
   *  battlefield (Cockatrice `keepAnnotations = (target == STACK)`), so piles
   *  and the hand never carry it. */
  annotation?: string;
}

/** A card on a battlefield, decoded from the wire `(x, y)` into a slot. */
export interface BattlefieldCardViewModel extends PlayerCardViewModel {
  /** Owner of the zone entry. Usually the seat's player; for a cross-player
   *  attachment (an aura on an opponent's creature) the card renders under its
   *  parent's seat but still lives in, and is commanded through, this owner's
   *  TABLE zone. */
  ownerPlayerId?: number;
  /** `row = y`, `col = floor(x / 3)`. */
  slot: BattlefieldSlot;
  /** `x % 3`: the card's sub-position inside its stack column. */
  subSlot: number;
  tapped: boolean;
  faceDown?: boolean;
  /** `AttrPT` override; empty means "use the card's printed P/T". */
  pt?: string;
  doesntUntap?: boolean;
  color?: string;
  /** Present only when attached (`attachCardId >= 0`). */
  attachTargetPlayerId?: number;
  attachTargetCardId?: number;
  /** Active per-card counters; Servatrice strips zero values. */
  counters?: readonly { id: number; value: number }[];
}

/** A mana-pool counter symbol. `C` is the wire "x" counter, `O` the "storm"
 *  counter desktop labels "Other". */
export type ManaSymbol = 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'O';

export interface PlayerSeatViewModel {
  playerId: number;
  /** False until the player's entry exists in the game state. */
  hydrated: boolean;
  isLocal: boolean;
  /** Board rendered upside down (every row above the local one). */
  mirrored: boolean;
  isActive: boolean;
  /** Real name, or "You" / "Player N" before the user info arrives. */
  displayName: string;
  username: string;
  avatarUrl: string | null;
  /** Opponent hand backs rotate 180° except in three-player layouts. */
  flipHandCardBacks: boolean;
  /** Bumped by every draw; drives the draw animation. */
  drawSeq: number;
  lastDrawCount: number;
  /** Every other seated player, for reveal / lend targets. */
  revealTargets: readonly { playerId: number; name: string }[];
}

/** A public zone: every card is known. `cardCount` is undefined until hydrated. */
export interface VisibleZoneViewModel {
  cards: readonly PlayerCardViewModel[];
  cardCount: number | undefined;
}

/** The hand: cards for the owner only; everyone else gets the authoritative count. */
export type HandZoneViewModel = VisibleZoneViewModel;

/** A hidden zone. `revealedCards` is the last Command_DumpZone snapshot. */
export interface HiddenZoneViewModel {
  cardCount: number | undefined;
  revealedCards: readonly PlayerCardViewModel[];
}

export interface LibraryZoneViewModel extends HiddenZoneViewModel {
  /** The currently known top card (always-reveal / always-look-at). */
  topCard: { name: string; scryfallId: string } | null;
  alwaysRevealTopCard: boolean;
  alwaysLookAtTopCard: boolean;
}

export interface BattlefieldViewModel {
  /** Own cards not attached elsewhere, then foreign cards attached here. */
  cards: readonly BattlefieldCardViewModel[];
}

export interface PlayerCounterViewModel {
  /** The counter named "life"; undefined before it exists. */
  life: { id: number; value: number } | undefined;
  /** Mana pool counters by symbol; undefined before the counters hydrate. */
  mana: Partial<Record<ManaSymbol, { id: number; count: number }>> | undefined;
}

export interface PlayerBoardPermissions {
  /** The local player owns this seat. */
  isOwner: boolean;
  /** The local user may act on this seat (own seat, or a judge). */
  canAct: boolean;
}

/** One card of the deck list the player loaded (the game's `.cod` document). */
export interface SeatDeckCard {
  name: string;
  /** Empty when the deck file carries no printing. */
  scryfallId: string;
  sideboard: boolean;
}

/**
 * A zone a server adds beyond the seven builtins (desktop's custom zones,
 * player_logic.cpp:98-170). It has no place on the board; the player menu
 * lists it for viewing. No stock Servatrice creates one.
 */
export interface CustomZoneViewModel {
  name: string;
  /** ServerInfo_Zone.type: private, public or hidden. */
  type: number;
  withCoords: boolean;
  cardCount: number;
}

export interface PlayerBoardModel {
  seat: PlayerSeatViewModel;
  /** The loaded deck list. Servatrice sends it only to the deck's owner, so it is
   *  empty on every other seat (and before a deck is loaded). */
  deck: readonly SeatDeckCard[];
  zones: {
    hand: HandZoneViewModel;
    library: LibraryZoneViewModel;
    graveyard: VisibleZoneViewModel;
    exile: VisibleZoneViewModel;
    stack: VisibleZoneViewModel;
    battlefield: BattlefieldViewModel;
    sideboard: HiddenZoneViewModel;
    /** Non-builtin zones, in the server's order; usually none. */
    customZones?: readonly CustomZoneViewModel[];
  };
  counters: PlayerCounterViewModel;
  permissions: PlayerBoardPermissions;
}

/** Who sees a reveal: one player, or every player at the table. */
export type RevealRecipient = number | 'all';

/** One card to move: its server id, or its position in a hidden zone (0 = top of the library). */
export type SeatMoveCard = number | {
  id: number;
  faceDown?: true;
  /** P/T the card lands with (desktop playCard sets the printed P/T). */
  pt?: string;
  tapped?: true;
};

/** Where a move from one of the seat's zones lands, on the seat's own player. */
export interface SeatMoveDestination {
  zone: ZoneNameValue;
  /**
   * Insert position in a pile (0 = top of the library), or `'end'` to append.
   * On the battlefield `'end'` asks Servatrice for a free column. Defaults to 0.
   */
  index?: number | 'end';
  /** Battlefield row. Defaults to 0. */
  row?: number;
  /** Insert the batch in reverse order (Command_MoveCard.is_reversed); sent only when given. */
  reversed?: boolean;
}

/** Which cards of a zone a reveal shows: the whole zone, one random card,
 *  the top N, or these cards by id (desktop actReveal over the selection). */
export type RevealSelection = 'zone' | 'random' | { top: number } | { cardIds: readonly number[] };

export interface PlayerZoneCommands {
  /**
   * Send one Command_MoveCard. A battlefield destination is resolved to the
   * nearest free sub-slot on the target player's board; a single known public
   * card moves optimistically and rolls back if the server rejects it.
   *
   * Takes the wire shape for now: the seat still builds it (the drop plan
   * `applyMove`). The destination translation moves here with DnD convergence.
   */
  move(params: MoveCardParams): void;
  /**
   * Move cards between two of the seat's own zones, in one Command_MoveCard.
   * Goes through `move`, so a battlefield destination gets the same free
   * sub-slot resolution and a single known card the same optimistic update.
   */
  moveCards(from: ZoneNameValue, cards: readonly SeatMoveCard[], to: SeatMoveDestination): void;
  draw(count: number): void;
  undoDraw(): void;
  mulligan(handSize: number): void;
  /** Whole library, or an inclusive `[start, end]` range (negative = from the bottom). */
  shuffleLibrary(range?: { start: number; end: number }): void;
  reveal(zone: ZoneNameValue, to: RevealRecipient, cards?: RevealSelection): void;
  /** Reveal the library with write access (desktop "Lend library"). */
  lendLibrary(to: number): void;
  setAlwaysRevealTopCard(value: boolean): void;
  setAlwaysLookAtTopCard(value: boolean): void;
}

/** The fields a clone copies from its source card. */
export interface CardCloneSource {
  name: string;
  providerId: string;
  color: string;
  pt: string;
  annotation: string;
  /** Row of the source; the clone lands on the same one. */
  y: number;
}

export interface CreateTokenRequest {
  name: string;
  color: string;
  pt: string;
  annotation: string;
  destroyOnZoneChange: boolean;
  faceDown: boolean;
  providerId?: string;
  targetCardId?: number;
  targetMode?: 'transform_into' | 'attach_to';
}

/** Commands on this seat's battlefield cards. */
export interface PlayerCardCommands {
  setTapped(cardIds: readonly number[], tapped: boolean): void;
  untapAll(): void;
  flip(cardId: number, faceDown: boolean): void;
  /** Owner only: reveal face-down cards to the local player. */
  peek?: (cardIds: readonly number[]) => void;
  setDoesntUntap(cardId: number, doesntUntap: boolean): void;
  setAnnotation(cardId: number, annotation: string): void;
  setPT(items: readonly { cardId: number; pt: string }[]): void;
  clone(source: CardCloneSource): void;
  createToken(request: CreateTokenRequest): Promise<void>;
}

/** Player counters, per-card counters, and the coin flip. */
export interface PlayerCounterCommands {
  increment(counterId: number, delta: number): void;
  set(counterId: number, value: number): void;
  /** Many card counters in one command container. */
  setCardCounters(entries: readonly { cardId: number; counterId: number; value: number }[]): void;
  flipCoin(): void;
}

/** Where an arrow ends: a card in any public zone, or a player. */
export type ArrowTarget =
  | { kind: 'card'; playerId: number; zone: ZoneNameValue; cardId: number }
  | { kind: 'player'; playerId: number };

/**
 * Arrows and attachments from one player's cards. An attach runs as that
 * card's owner, so a judge acting on another player's card wraps it in
 * Command_Judge; an arrow belongs to the local player and is never wrapped
 * (desktop CardItem::drawArrow draws as the active local player).
 */
export interface PlayerTargetCommands {
  attach(sourceCardId: number, target: { playerId: number; cardId: number }): void;
  unattach(sourceCardId: number): void;
  /** Draw an arrow from one of this player's cards in `sourceZone`. Red unless `color` is given. */
  createArrow(sourceCardId: number, sourceZone: ZoneNameValue, target: ArrowTarget, color?: ColorRGBA): void;
  /**
   * Play a hand card, then draw the arrow from where it lands (desktop
   * ArrowDragItem::mouseReleaseEvent, arrow_item.cpp:434-446). The arrow keeps
   * the hand-side card id; Servatrice resolves it against the moved card.
   */
  playAndCreateArrow(handCardId: number, target: ArrowTarget, color?: ColorRGBA): void;
  /** Delete every arrow this seat's player drew. */
  clearOwnArrows(): void;
}

export interface PlayerBoardCommands {
  zone: PlayerZoneCommands;
  card: PlayerCardCommands;
  counter: PlayerCounterCommands;
  target: PlayerTargetCommands;
}
