import { ZoneName } from '@cockatrice/sockatrice';
import type { MoveCardParams } from '@cockatrice/sockatrice/generated';

import type { Coordinates, PointerGestureData } from './gamePointerSensor';
import { planHandReorder, planPositionalReorder } from './handReorder';

/**
 * Drag data, drop targets and the drop → Command_MoveCard plan for the seat
 * (PlayerBoard) surfaces. useGameDnd coordinates every gesture; the seat only
 * says what is being dragged and, for each zone it renders, where in that
 * zone a drop lands, because it owns that zone's layout.
 */

/** The seat zones cards can be dragged from and dropped on. */
export type SeatZone = 'hand' | 'battlefield' | 'library' | 'graveyard' | 'exile' | 'stack' | 'sideboard';

export interface SeatSlot {
  row: number;
  col: number;
}

/** A dragged card as its zone renders it. Hidden zones (library, sideboard)
 *  carry the server position as the id; the battlefield carries the slot. */
export interface SeatDragCard {
  id: string;
  slot?: SeatSlot;
  /** The card's owner, whose zone it lives in, when that is not the seat's
   *  player: a card attached to one of this seat's battlefield cards. A
   *  drag never mixes owners. */
  ownerPlayerId?: number;
  /** The card's printed P/T, which it lands with when it enters the
   *  battlefield from another zone. */
  printedPT?: string;
}

export interface SeatDragSource extends PointerGestureData {
  kind: 'seat';
  /** The seat whose surface started the drag; a lent zone drags from the
   *  local seat. */
  seatPlayerId: number;
  zone: SeatZone;
  /** Moved together, in display order. */
  cards: readonly SeatDragCard[];
  /** Owner of a lent zone (Command_RevealCards with grant_write_access): the
   *  move starts in their zone and may only land on a battlefield. */
  lenderPlayerId?: number;
}

/** Where on a zone a drop lands, as the zone's owner resolved it. */
export type SeatDropTarget =
  | { zone: 'battlefield'; playerId: number; slot: SeatSlot; grid: { rows: number; cols: number } }
  /** `order` is the hand strip's card ids as shown, which a reorder replays. */
  | { zone: 'hand'; index: number; order?: readonly string[] }
  | { zone: 'stack'; index: number }
  /** `position` is an exact deck position (a drop on the reveal dialog). */
  | { zone: 'library'; position?: number }
  | { zone: 'graveyard' | 'exile' | 'sideboard' };

/** The drop point, in viewport coordinates: the pointer, and the dragged
 *  card's top-left (the pointer minus where the card was grabbed). */
export interface SeatDropPoint {
  pointer: Coordinates;
  cardOrigin: Coordinates;
}

export interface SeatDropZone {
  kind: 'seat-drop';
  /** The seat that renders the zone. */
  seatPlayerId: number;
  /** Battlefields take drops from every seat (gifts); every other zone only
   *  from its own seat. */
  acceptsOtherSeats?: boolean;
  /** When several seat zones are under the pointer the highest wins, so a
   *  dialog takes the drop over the board beneath it. */
  priority: number;
  resolve: (drop: SeatDropPoint, source: SeatDragSource) => SeatDropTarget | null;
}

/** Seat drop priorities, highest first, in PlayerBox's hit-test order. */
export const SEAT_DROP_PRIORITY = {
  librarySearchDialog: 100,
  pileViewDialog: 90,
  sideboardDialog: 80,
  revealDialog: 70,
  battlefield: 50,
  stack: 40,
  hand: 30,
  library: 20,
  graveyard: 10,
  exile: 5,
} as const;

export function isSeatDragSource(data: unknown): data is SeatDragSource {
  return (data as SeatDragSource | undefined)?.kind === 'seat';
}

export function isSeatDropZone(data: unknown): data is SeatDropZone {
  return (data as SeatDropZone | undefined)?.kind === 'seat-drop';
}

/** The player whose zone the dragged cards leave: their owner, which for a
 *  card attached across seats is not the seat that shows it. (A lent zone's
 *  cards leave the lender's zone; see planSeatMove.) */
export function seatDragOwner(source: SeatDragSource): number {
  return source.cards[0]?.ownerPlayerId ?? source.seatPlayerId;
}

export function seatDropAccepts(zone: SeatDropZone, source: SeatDragSource): boolean {
  return zone.acceptsOtherSeats === true || zone.seatPlayerId === seatDragOwner(source);
}

const WIRE_ZONE: Record<SeatZone, string> = {
  battlefield: ZoneName.TABLE,
  hand: ZoneName.HAND,
  library: ZoneName.DECK,
  graveyard: ZoneName.GRAVE,
  exile: ZoneName.EXILE,
  stack: ZoneName.STACK,
  sideboard: ZoneName.SIDEBOARD,
};

/**
 * Where each card of a group dropped on its own battlefield lands, before the
 * three-per-stack cap. Cards from one stack collapse onto the drop slot; cards
 * from several stacks keep their shape relative to the group's top-left,
 * clamped to the grid; anything else spreads row-major from the drop slot.
 */
export function intendedBattlefieldSlots(
  cards: readonly SeatDragCard[],
  start: SeatSlot,
  grid: { rows: number; cols: number },
): SeatSlot[] {
  if (cards.length === 0) {
    return [];
  }
  const rows = Math.max(1, grid.rows);
  const cols = Math.max(1, grid.cols);
  const sourceSlots = cards.map((c) => c.slot);
  if (sourceSlots.every((s): s is SeatSlot => s !== undefined)) {
    const first = sourceSlots[0];
    if (sourceSlots.every((s) => s.row === first.row && s.col === first.col)) {
      return cards.map(() => start);
    }
    const minRow = Math.min(...sourceSlots.map((s) => s.row));
    const minCol = Math.min(...sourceSlots.map((s) => s.col));
    return sourceSlots.map((s) => ({
      row: Math.max(0, Math.min(rows - 1, start.row + (s.row - minRow))),
      col: Math.max(0, Math.min(cols - 1, start.col + (s.col - minCol))),
    }));
  }
  const out: SeatSlot[] = [];
  let index = start.row * cols + start.col;
  for (let i = 0; i < cards.length; i++, index++) {
    const wrapped = index % (cols * rows);
    out.push({ row: Math.floor(wrapped / cols), col: wrapped % cols });
  }
  return out;
}

/**
 * The Command_MoveCard set a seat drop sends: empty for a no-op, one command
 * for a move, one per card for a re-slot on the dragging seat's own
 * battlefield (each card keeps its own slot).
 *
 * Battlefield `x` asks for the stack column (`col * 3`); the move path picks
 * the free sub-slot against the target board. Hidden zones address cards by
 * position, so their ids go on the wire as-is (a pile drag's non-numeric id
 * means the top card, 0).
 */
export interface SeatMoveOptions {
  /** The local user judges the game: Servatrice lets a judge move any
   *  player's cards anywhere (server_abstract_player.cpp:788, 801). */
  judge?: boolean;
}

export function planSeatMove(source: SeatDragSource, target: SeatDropTarget, options: SeatMoveOptions = {}): MoveCardParams[] {
  const seat = source.seatPlayerId;
  // Desktop moves a card out of its own zone (TableZone::handleDropEventByGrid
  // takes the start player from the card's zone), so a card attached across
  // seats starts in its owner's TABLE.
  const owner = seatDragOwner(source);
  if (source.cards.length === 0) {
    return [];
  }
  // Desktop only drags a lent zone's cards onto a table, and Servatrice only
  // takes them onto the borrower's own: a move whose start and target players
  // both differ from the sender is refused, unless the sender judges
  // (server_abstract_player.cpp:801).
  if (source.lenderPlayerId != null
    && (target.zone !== 'battlefield' || (target.playerId !== seat && !options.judge))) {
    return [];
  }

  if (target.zone === 'battlefield' && source.zone === 'battlefield' && target.playerId === seat && owner === seat) {
    const slots = intendedBattlefieldSlots(source.cards, target.slot, target.grid);
    return source.cards.flatMap((card, i) => {
      const cardId = Number(card.id);
      if (!Number.isFinite(cardId)) {
        return [];
      }
      const slot = slots[i] ?? target.slot;
      return [{
        startPlayerId: seat,
        startZone: ZoneName.TABLE,
        cardsToMove: { card: [{ cardId }] },
        targetPlayerId: seat,
        targetZone: ZoneName.TABLE,
        x: slot.col * 3,
        y: slot.row,
      } as MoveCardParams];
    });
  }

  // A hand reorder sends one single-card command per dragged card, so a group
  // lands together and in order (see planHandReorder).
  if (target.zone === 'hand' && source.zone === 'hand' && target.order) {
    return planHandReorder(target.order, source.cards.map((card) => card.id), target.index).flatMap(({ cardId, x }) => {
      const id = Number(cardId);
      if (!Number.isFinite(id)) {
        return [];
      }
      return [{
        startPlayerId: seat,
        startZone: ZoneName.HAND,
        cardsToMove: { card: [{ cardId: id }] },
        targetPlayerId: seat,
        targetZone: ZoneName.HAND,
        x,
        y: 0,
        isReversed: false,
      } as MoveCardParams];
    });
  }

  // A move within the library goes one card at a time, as a hand reorder
  // does, so a group lands together and in order: Servatrice moves a
  // multi-card command card by card. Positions are counted among the cards
  // not moved, and each command addresses its card where it then is.
  if (source.zone === 'library' && target.zone === 'library' && target.position !== undefined) {
    const positions = source.cards.map((card) => Number(card.id));
    if (positions.some((p) => !Number.isFinite(p))) {
      return [];
    }
    return planPositionalReorder(positions, target.position).map(({ cardId, x }) => ({
      startPlayerId: owner,
      startZone: ZoneName.DECK,
      cardsToMove: { card: [{ cardId }] },
      targetPlayerId: owner,
      targetZone: ZoneName.DECK,
      x,
      y: 0,
      isReversed: false,
    } as MoveCardParams));
  }

  const reorderable = target.zone === 'hand' || target.zone === 'battlefield';
  if (target.zone === source.zone && !reorderable) {
    return [];
  }

  const hiddenSource = source.zone === 'library' || source.zone === 'sideboard';
  const cardIds = source.cards.map((card) => {
    const id = Number(card.id);
    return Number.isFinite(id) ? id : hiddenSource ? 0 : null;
  });
  if (cardIds.some((id) => id === null)) {
    return [];
  }

  const x = (() => {
    switch (target.zone) {
      case 'battlefield':
        return target.slot.col * 3;
      case 'hand':
      case 'stack':
        return target.index;
      case 'sideboard':
        // A hidden zone with no visible order: append.
        return -1;
      case 'library':
        return target.position ?? 0;
      default:
        return 0;
    }
  })();

  // A card entering the battlefield from another zone carries its printed
  // P/T (desktop TableZone::handleDropEventByGrid, table_zone.cpp:192-203).
  // Unlike a play, a drop never taps a cipt card.
  const entersBattlefield = target.zone === 'battlefield' && source.zone !== 'battlefield';
  return [{
    startPlayerId: source.lenderPlayerId ?? owner,
    startZone: WIRE_ZONE[source.zone],
    cardsToMove: {
      card: cardIds.map((cardId, i) => {
        const pt = entersBattlefield ? source.cards[i].printedPT : undefined;
        return { cardId: cardId as number, ...(pt && { pt }) };
      }),
    },
    targetPlayerId: target.zone === 'battlefield' ? target.playerId : owner,
    targetZone: WIRE_ZONE[target.zone],
    x,
    y: target.zone === 'battlefield' ? target.slot.row : 0,
    isReversed: false,
  } as MoveCardParams];
}
