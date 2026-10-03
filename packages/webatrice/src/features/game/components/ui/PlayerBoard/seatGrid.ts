import type { CSSProperties } from 'react';

import { CARD_HEIGHT, CARD_WIDTH } from '../SeatCard/cardSize';

type Placement = Pick<CSSProperties, 'gridColumn' | 'gridRow'>;

/** Where each of the seat's regions sits in the seat's CSS grid. */
export interface SeatGrid {
  /** The seat's `gridTemplateColumns` / `gridTemplateRows`. */
  template: Pick<CSSProperties, 'gridTemplateColumns' | 'gridTemplateRows'>;
  info: Placement;
  hand: Placement;
  stack: Placement;
  battlefield: Placement;
}

// Info column: life, a 3×2 mana pip grid and the sideways zone piles, so a card height plus a
// little padding. In em so it scales with the seat's font size.
const INFO_COLUMN = `calc(${CARD_HEIGHT} + 1.5em)`;
// Stack column: after its p-2 padding the inner width is one card width, with room to zig-zag.
const STACK_COLUMN = `calc((${CARD_WIDTH} + 1rem) * 1.2)`;
// Desktop's vertical hand is one and a half cards wide (HandZone::boundingRect).
const VERTICAL_HAND_COLUMN = `calc(${CARD_WIDTH} * 1.5)`;
// The horizontal hand row reserves 60% of a card height and a hair of breathing room: idle, 60%
// of each card shows; hovered, the rest floats over the play area without reflowing the grid.
const HAND_ROW = `calc(${CARD_HEIGHT} * 0.6 + 0.5em)`;

/**
 * The seat's grid, following desktop's PlayerGraphicsItem::rearrangeZones.
 *
 * Horizontal hand (desktop's default): the hand is a row under the stack and battlefield, or
 * above them on a mirrored seat; the info column spans both rows.
 *
 *   +------+-------+-------------+
 *   | Info | Stack | Battlefield |
 *   |      +-------+-------------+
 *   |      |        Hand         |
 *   +------+---------------------+
 *
 * Vertical hand: the hand is a column between the info column and the stack, on every seat.
 *
 *   +------+------+-------+-------------+
 *   | Info | Hand | Stack | Battlefield |
 *   +------+------+-------+-------------+
 */
export function seatGrid({ horizontalHand, handOnTop }: { horizontalHand: boolean; handOnTop: boolean }): SeatGrid {
  if (!horizontalHand) {
    return {
      template: {
        gridTemplateColumns: `${INFO_COLUMN} ${VERTICAL_HAND_COLUMN} ${STACK_COLUMN} 1fr`,
        gridTemplateRows: '1fr',
      },
      info: { gridColumn: 1, gridRow: 1 },
      hand: { gridColumn: 2, gridRow: 1 },
      stack: { gridColumn: 3, gridRow: 1 },
      battlefield: { gridColumn: 4, gridRow: 1 },
    };
  }
  const playRow = handOnTop ? 2 : 1;
  return {
    template: {
      gridTemplateColumns: `${INFO_COLUMN} ${STACK_COLUMN} 1fr`,
      gridTemplateRows: handOnTop ? `${HAND_ROW} 1fr` : `1fr ${HAND_ROW}`,
    },
    info: { gridColumn: 1, gridRow: '1 / -1' },
    hand: { gridColumn: '2 / 4', gridRow: handOnTop ? 1 : 2 },
    stack: { gridColumn: 2, gridRow: playRow },
    battlefield: { gridColumn: 3, gridRow: playRow },
  };
}
