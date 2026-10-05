import { tableRowToGridY } from '../../components/battlefield/Battlefield/cardPlacement';
import { applyInvertY } from '../../components/battlefield/Battlefield/gridMath';
import type { BattlefieldGeometry } from '../../components/ui/BattlefieldGeometryContext';
import { seatDragOwner, type SeatDragSource, type SeatDropTarget } from '../../hooks/seatDropPlan';

/**
 * The keyboard's way to every move a drag can make (aud.md G3): a zone, with
 * a battlefield of any player, and a position in it. Each choice becomes the
 * very SeatDropTarget the drop zone resolves for the pointer (the same slot
 * and grid, the same hand order and index), so planSeatMove plans the same
 * commands for both. Nothing here works out where cards land; it only says
 * which drop the choice is.
 */
export type MoveDestination =
  | { zone: 'battlefield'; playerId: number }
  | { zone: 'hand' | 'stack' | 'library' | 'graveyard' | 'exile' };

/** What the dialog reads off the board for the moved cards. */
export interface MoveBoard {
  /** Every seated player, whose battlefields take a move. */
  players: readonly { playerId: number; name: string }[];
  /** The cards' owner's hand as shown, which a hand drop carries. */
  handOrder: readonly string[];
  /** The owner's stack and library sizes. */
  stackSize: number;
  deckSize: number;
  /** A battlefield's drop grid, as its board lays it out. */
  geometry: (playerId: number) => BattlefieldGeometry;
}

/** Where a move may go: as for a drop, never back into the zone the cards
 *  are in unless that zone has positions, and a lent card only onto the
 *  borrower's battlefield (every battlefield for a judge), which is all
 *  Servatrice takes (server_abstract_player.cpp:801). */
export function moveDestinations(
  source: SeatDragSource,
  players: MoveBoard['players'],
  { judge = false }: { judge?: boolean } = {},
): MoveDestination[] {
  const owner = source.lenderPlayerId != null ? source.seatPlayerId : seatDragOwner(source);
  const battlefields: MoveDestination[] = [...players]
    .sort((a, b) => Number(b.playerId === owner) - Number(a.playerId === owner))
    .filter((p) => source.lenderPlayerId == null || judge || p.playerId === source.seatPlayerId)
    .map((p) => ({ zone: 'battlefield', playerId: p.playerId }));
  if (source.lenderPlayerId != null) {
    return battlefields;
  }
  const zones: MoveDestination['zone'][] = ['hand', 'stack', 'library', 'graveyard', 'exile'];
  const reorderable = new Set<string>(['hand', 'library', 'battlefield']);
  return [
    ...battlefields,
    ...zones.filter((zone) => zone !== source.zone || reorderable.has(zone)).map((zone) => ({ zone }) as MoveDestination),
  ];
}

/** The battlefield rows by what desktop plays there (tableRowToGridY), as
 *  the rows go on the wire for this viewer: lands, creatures, other. */
export function battlefieldRows(inverted: boolean): { kind: 'lands' | 'creatures' | 'other'; row: number }[] {
  return ([['lands', 0], ['creatures', 1], ['other', 2]] as const).map(([kind, tableRow]) => ({
    kind,
    row: applyInvertY(tableRowToGridY(tableRow), inverted),
  }));
}

/** How many positions a zone offers (1-based; the last one is the end): a
 *  battlefield row's columns a drop can reach on its board; in the hand, on
 *  the stack and in the library, the gaps between the cards that stay, as
 *  the drop counts them. Graveyard and exile have no position. */
export function positionCount(destination: MoveDestination, source: SeatDragSource, board: MoveBoard, row: number): number {
  const staying = (size: number) => Math.max(0, size - (source.zone === destination.zone ? source.cards.length : 0));
  switch (destination.zone) {
    case 'battlefield':
      return board.geometry(destination.playerId).colsByWireRow[row] ?? 0;
    case 'hand':
      return staying(board.handOrder.length) + 1;
    case 'stack':
      return staying(board.stackSize) + 1;
    case 'library':
      return staying(board.deckSize) + 1;
    default:
      return 0;
  }
}

/** The drop target a choice stands for, as the drop zone resolves it.
 *  `position` is 1-based: a battlefield column, or the place among the
 *  cards that stay in the hand, on the stack or in the library. */
export function moveTarget(
  destination: MoveDestination,
  board: MoveBoard,
  { position, row }: { position: number; row: number },
): SeatDropTarget {
  const index = Math.max(0, position - 1);
  switch (destination.zone) {
    case 'battlefield': {
      const { rows, cols } = board.geometry(destination.playerId);
      return { zone: 'battlefield', playerId: destination.playerId, slot: { row, col: index }, grid: { rows, cols } };
    }
    case 'hand':
      return { zone: 'hand', index, order: board.handOrder };
    case 'stack':
      return { zone: 'stack', index };
    case 'library':
      return { zone: 'library', position: index };
    default:
      return { zone: destination.zone };
  }
}
