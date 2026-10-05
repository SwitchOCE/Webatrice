import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';

import { tableRowToGridY } from '../../components/battlefield/Battlefield/cardPlacement';
import { applyInvertY, nextAvailableColumn, ROW_COUNT } from '../../components/battlefield/Battlefield/gridMath';
import { seatDragOwner, type SeatDragSource, type SeatDropTarget } from '../../hooks/seatDropPlan';

/**
 * The keyboard's way to every move a drag can make (aud.md G3): a zone, with
 * a battlefield of any player, and a position in it. Each choice becomes the
 * SeatDropTarget the drop zone would have resolved, so the move goes through
 * planSeatMove and the same commands as a drop there.
 */
export type MoveDestination =
  | { zone: 'battlefield'; playerId: number }
  | { zone: 'hand' | 'stack' | 'library' | 'graveyard' | 'exile' };

/** What the dialog reads off the board for the moved cards. */
export interface MoveBoard {
  /** Every seated player, whose battlefields take the move (desktop lets a
   *  card be dropped on another player's table). */
  players: readonly { playerId: number; name: string }[];
  /** The cards' owner's zone sizes: the zones a move lands in. */
  handSize: number;
  stackSize: number;
  deckSize: number;
  /** A player's battlefield cards, for the free columns of each row. */
  battlefield: (playerId: number) => readonly ServerInfo_Card[];
}

/** Where a move may go: as for a drop, a lent card only onto a battlefield,
 *  and never back into the zone it is in unless that zone has positions. */
export function moveDestinations(source: SeatDragSource, players: MoveBoard['players']): MoveDestination[] {
  const owner = seatDragOwner(source);
  const battlefields: MoveDestination[] = [...players]
    .sort((a, b) => Number(b.playerId === owner) - Number(a.playerId === owner))
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

/** How many positions a zone offers the moved cards (1-based, the last one
 *  is the end): the cards already there, without the moved ones if they are
 *  in it already, plus one. A battlefield row offers its columns and a new
 *  one after them. Graveyard and exile have no position. */
export function positionCount(destination: MoveDestination, source: SeatDragSource, board: MoveBoard, row: number): number {
  const staying = (size: number) => Math.max(0, size - (source.zone === destination.zone ? source.cards.length : 0));
  switch (destination.zone) {
    case 'battlefield':
      return nextAvailableColumn([...board.battlefield(destination.playerId)], row) + 1;
    case 'hand':
      return staying(board.handSize) + 1;
    case 'stack':
      return staying(board.stackSize) + 1;
    case 'library':
      return staying(board.deckSize) + 1;
    default:
      return 0;
  }
}

/** The drop target a choice stands for. `position` is 1-based: a hand or
 *  stack index, a library position from the top, a battlefield column. */
export function moveTarget(
  destination: MoveDestination,
  source: SeatDragSource,
  options: { position: number; row: number; handOrder?: readonly string[] },
): SeatDropTarget {
  const index = Math.max(0, options.position - 1);
  switch (destination.zone) {
    case 'battlefield':
      return {
        zone: 'battlefield',
        playerId: destination.playerId,
        slot: { row: options.row, col: index },
        // Room for every moved card to the right, so a spread never wraps.
        grid: { rows: ROW_COUNT, cols: index + source.cards.length },
      };
    case 'hand':
      return source.zone === 'hand' && options.handOrder
        ? { zone: 'hand', index, order: options.handOrder }
        : { zone: 'hand', index };
    case 'stack':
      return { zone: 'stack', index };
    case 'library':
      return { zone: 'library', position: index };
    default:
      return { zone: destination.zone };
  }
}
