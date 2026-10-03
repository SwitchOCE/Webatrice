/**
 * Desktop's vertical hand (Appearance › "Display hand horizontally" off): a port of
 * SelectZone::computeZoneLayout and layoutCardsVertically (select_zone.cpp), which the hand
 * uses with no minimum offset and no bottom overflow.
 */

/** Desktop's `xspace`: the gap kept between a zig-zagged card and the column's edge. */
export const VERTICAL_HAND_X_SPACE_PX = 5;

export interface VerticalHandLayout {
  /** Top-left of each card in the column, in hand order. */
  positions: { x: number; y: number }[];
  /** How far each card sits below the one before it. */
  offset: number;
}

/**
 * Each card advances by `(100 - overlapPercent)%` of a card height ("Minimum overlap
 * percentage of cards on the stack and in vertical hand"), compressed so the whole hand fits
 * the column; the hand is centred vertically when it is shorter than the column. A lone card is
 * centred; more alternate between the left and right edges.
 */
export function layoutVerticalHand(
  count: number,
  containerW: number,
  containerH: number,
  cardW: number,
  cardH: number,
  overlapPercent: number,
  xSpace: number = VERTICAL_HAND_X_SPACE_PX,
): VerticalHandLayout {
  if (count <= 0) {
    return { positions: [], offset: 0 };
  }
  let offset = (cardH * (100 - overlapPercent)) / 100;
  if (count > 1) {
    // No bottom overflow: reserve a whole card for the last one, and keep every card's top
    // inside the column.
    const fitOffset = Math.min((containerH - cardH) / (count - 1), containerH / (count - 1));
    offset = Math.max(0, Math.min(offset, fitOffset));
  }
  const pileHeight = (count - 1) * offset + cardH;
  const start = pileHeight <= containerH ? (containerH - pileHeight) / 2 : 0;
  const left = xSpace;
  const right = containerW - xSpace - cardW;
  const centred = (containerW - cardW) / 2;
  const positions = Array.from({ length: count }, (_, i) => ({
    x: count === 1 ? centred : i % 2 ? right : left,
    y: start + i * offset,
  }));
  return { positions, offset };
}

/**
 * Where a card dropped at `pointerY` goes in a vertical hand (SelectZone::calcDropIndexFromY):
 * the nearest gap between card tops. `tops` are the tops of the hand's cards that are not being
 * dragged, in hand order and in the pointer's coordinates.
 */
export function verticalHandDropIndex(tops: readonly number[], pointerY: number, cardH: number): number {
  if (tops.length === 0) {
    return 0;
  }
  const offset = tops.length > 1 ? tops[1] - tops[0] : cardH;
  if (offset <= 0) {
    return 0;
  }
  const index = Math.round((pointerY - tops[0]) / offset);
  return Math.max(0, Math.min(tops.length, index));
}
