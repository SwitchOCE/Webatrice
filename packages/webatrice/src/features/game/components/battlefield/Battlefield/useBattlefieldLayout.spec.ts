import { renderHook } from '@testing-library/react';

import type { BattlefieldCardViewModel } from '../../ui/PlayerBoard/playerBoard.types';
import { BATTLEFIELD_MIN_COLS, BATTLEFIELD_ROWS, rowTopY, slotOriginPx, STACK_OFFSET_PX } from './battlefieldLayout';
import { useBattlefieldLayout } from './useBattlefieldLayout';

const card = (
  id: number,
  row: number,
  col: number,
  extra: Partial<BattlefieldCardViewModel> = {},
): BattlefieldCardViewModel => ({
  id: String(id),
  name: `Card ${id}`,
  scryfallId: '',
  slot: { row, col },
  subSlot: 0,
  tapped: false,
  ...extra,
});

function renderLayout(cards: BattlefieldCardViewModel[], mirrored = false) {
  return renderHook(() => useBattlefieldLayout({ cards, playerId: 1, mirrored })).result.current;
}

describe('useBattlefieldLayout', () => {
  it('reserves the minimum columns on an empty board, plus a buffer column past the rightmost card', () => {
    expect(renderLayout([]).colsByRow).toEqual(new Array(BATTLEFIELD_ROWS).fill(BATTLEFIELD_MIN_COLS));

    const { colsByRow, gridCols, gridRows } = renderLayout([card(1, 0, 6)]);
    expect(colsByRow[0]).toBe(8);
    expect(gridCols).toBe(8);
    expect(gridRows).toBe(BATTLEFIELD_ROWS);
  });

  it('places a card at its slot origin, flipping the row on a mirrored board', () => {
    const own = renderLayout([card(1, 0, 2)]);
    expect(own.battlefieldPositions.get('1')).toEqual(
      slotOriginPx({ row: 0, col: 2, subSlot: 0 }, own.cellWidths, own.battlefieldLayout),
    );

    const mirrored = renderLayout([card(1, 0, 2)], true);
    expect(mirrored.battlefieldPositions.get('1')).toEqual(
      slotOriginPx({ row: BATTLEFIELD_ROWS - 1, col: 2, subSlot: 0 }, mirrored.cellWidths, mirrored.battlefieldLayout),
    );
  });

  it('fans attached cards left of their parent, which shifts right and down to make room', () => {
    const parent = card(1, 1, 0);
    const aura = card(2, 0, 3, { attachTargetPlayerId: 1, attachTargetCardId: 1 });
    const equipment = card(3, 2, 4, { attachTargetPlayerId: 1, attachTargetCardId: 1 });
    const { battlefieldPositions, cellWidths, battlefieldLayout } = renderLayout([parent, aura, equipment]);

    const origin = slotOriginPx({ row: 1, col: 0, subSlot: 0 }, cellWidths, battlefieldLayout);
    const parentPos = { x: origin.x + 2 * STACK_OFFSET_PX, y: origin.y + 15 };
    expect(battlefieldPositions.get('1')).toEqual(parentPos);
    // Children sit in the parent's row, whatever slot the wire gives them.
    const childY = rowTopY(1, battlefieldLayout) + 5;
    expect(battlefieldPositions.get('2')).toEqual({ x: parentPos.x - STACK_OFFSET_PX, y: childY });
    expect(battlefieldPositions.get('3')).toEqual({ x: parentPos.x - 2 * STACK_OFFSET_PX, y: childY });
  });

  it('lays out a card attached to a card on another board at its own slot', () => {
    const foreign = card(5, 1, 2, { attachTargetPlayerId: 2, attachTargetCardId: 9 });
    const { battlefieldPositions, cellWidths, battlefieldLayout } = renderLayout([foreign]);
    expect(battlefieldPositions.get('5')).toEqual(
      slotOriginPx({ row: 1, col: 2, subSlot: 0 }, cellWidths, battlefieldLayout),
    );
  });

  it('widens the content as columns open', () => {
    expect(renderLayout([card(1, 0, 12)]).naturalContentW).toBeGreaterThan(renderLayout([]).naturalContentW);
  });
});
