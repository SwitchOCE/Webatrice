/**
 * Desktop's vertical piles, the stack and a vertical hand (Appearance › "Display hand
 * horizontally" off): a port of SelectZone::computeZoneLayout and layoutCardsVertically
 * (select_zone.cpp), which both use without bottom overflow.
 */

/** Desktop's `xspace`: the gap kept between a zig-zagged card and the pile's edge, at scale 1. */
export const VERTICAL_PILE_X_SPACE_PX = 5;
/** Desktop's MIN_CARD_VISIBLE: how much of each card the stack keeps showing, at scale 1. */
export const STACK_MIN_CARD_VISIBLE_PX = 10;

export interface VerticalPileOptions {
  /** "Minimum overlap percentage of cards on the stack and in vertical hand" (desktop default 33). */
  overlapPercent: number;
  /** The least a card may advance, when the pile has room for it (the stack's MIN_CARD_VISIBLE). */
  minOffset?: number;
  xSpace?: number;
}

export interface VerticalPileLayout {
  /** Top-left of each card in the pile, in pile order. */
  positions: { x: number; y: number }[];
  /** How far each card sits below the one before it. */
  offset: number;
}

/**
 * Each card advances by `(100 - overlapPercent)%` of a card height, compressed so the whole pile
 * fits the container (never below `minOffset` while that still fits); the pile is centred
 * vertically when it is shorter than the container. A lone card is centred; more alternate
 * between the left and right edges.
 */
export function layoutVerticalPile(
  count: number,
  containerW: number,
  containerH: number,
  cardW: number,
  cardH: number,
  { overlapPercent, minOffset = 0, xSpace = VERTICAL_PILE_X_SPACE_PX }: VerticalPileOptions,
): VerticalPileLayout {
  if (count <= 0) {
    return { positions: [], offset: 0 };
  }
  let offset = (cardH * (100 - overlapPercent)) / 100;
  if (count > 1) {
    // No bottom overflow: reserve a whole card for the last one, and keep every card's top
    // inside the container.
    const fitOffset = Math.min((containerH - cardH) / (count - 1), containerH / (count - 1));
    offset = Math.min(offset, fitOffset);
    if (fitOffset >= minOffset) {
      offset = Math.max(minOffset, offset);
    }
    offset = Math.max(0, offset);
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
 * Where a card dropped at `pointerY` goes in a vertical pile (SelectZone::calcDropIndexFromY):
 * the nearest gap between card tops. `tops` are the tops of the pile's cards that are not being
 * dragged, in pile order and in the pointer's coordinates.
 */
export function verticalPileDropIndex(tops: readonly number[], pointerY: number, cardH: number): number {
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
