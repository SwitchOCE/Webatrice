import { layoutVerticalHand, verticalHandDropIndex } from './verticalHandLayout';

describe('layoutVerticalHand', () => {
  it('lays out nothing for an empty hand', () => {
    expect(layoutVerticalHand(0, 108, 600, 72, 102, 33)).toEqual({ positions: [], offset: 0 });
  });

  it('centres a lone card in the column', () => {
    const { positions } = layoutVerticalHand(1, 108, 600, 72, 102, 33);
    expect(positions).toEqual([{ x: 18, y: 249 }]);
  });

  it('advances each card by the share of a card the overlap leaves showing, zig-zagging left and right', () => {
    const { positions, offset } = layoutVerticalHand(3, 108, 1000, 72, 100, 33);
    expect(offset).toBe(67);
    // Pile 2 × 67 + 100 = 234 tall, centred in 1000.
    expect(positions).toEqual([
      { x: 5, y: 383 },
      { x: 31, y: 450 },
      { x: 5, y: 517 },
    ]);
  });

  it('follows the overlap preference', () => {
    expect(layoutVerticalHand(3, 108, 1000, 72, 100, 80).offset).toBe(20);
    expect(layoutVerticalHand(3, 108, 1000, 72, 100, 0).offset).toBe(100);
  });

  it('compresses a hand that does not fit so the last card stays whole inside the column', () => {
    const { positions, offset } = layoutVerticalHand(11, 108, 600, 72, 100, 33);
    expect(offset).toBe(50);
    expect(positions[0].y).toBe(0);
    expect(positions[10].y + 100).toBe(600);
  });

  it('never stacks cards upward in a column shorter than a card', () => {
    const { positions } = layoutVerticalHand(3, 108, 50, 72, 100, 33);
    expect(positions.map((p) => p.y)).toEqual([0, 0, 0]);
  });
});

describe('verticalHandDropIndex', () => {
  const tops = [100, 150, 200];

  it('is 0 for an empty hand', () => {
    expect(verticalHandDropIndex([], 500, 100)).toBe(0);
  });

  it('picks the nearest gap between card tops', () => {
    expect(verticalHandDropIndex(tops, 90, 100)).toBe(0);
    expect(verticalHandDropIndex(tops, 120, 100)).toBe(0);
    expect(verticalHandDropIndex(tops, 130, 100)).toBe(1);
    expect(verticalHandDropIndex(tops, 180, 100)).toBe(2);
  });

  it('allows dropping after the last card, and no further', () => {
    expect(verticalHandDropIndex(tops, 230, 100)).toBe(3);
    expect(verticalHandDropIndex(tops, 900, 100)).toBe(3);
  });

  it('uses a card height as the step for a single card', () => {
    expect(verticalHandDropIndex([100], 140, 100)).toBe(0);
    expect(verticalHandDropIndex([100], 160, 100)).toBe(1);
  });
});
