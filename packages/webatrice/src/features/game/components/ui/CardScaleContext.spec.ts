import { computeScale, REFERENCE_CELL_HEIGHT_NO_HAND_PX, REFERENCE_CELL_HEIGHT_PX } from './CardScaleContext';

describe('computeScale', () => {
  it('scales a seat row against the hand-row reference by default', () => {
    expect(computeScale(920, 2)).toBeCloseTo(460 / REFERENCE_CELL_HEIGHT_PX);
    expect(computeScale(0, 2)).toBe(1);
  });

  it('gives seats without a hand row a smaller reference so two players at 1440x900 get at least default cards', () => {
    const boardHeight = 900 - 44 - 44 - 162;
    expect(computeScale(boardHeight, 2, REFERENCE_CELL_HEIGHT_NO_HAND_PX)).toBeGreaterThanOrEqual(1);
    expect(computeScale(boardHeight, 2, REFERENCE_CELL_HEIGHT_NO_HAND_PX)).toBeGreaterThan(computeScale(boardHeight, 2));
  });

  it('clamps to the readable range', () => {
    expect(computeScale(10, 4, REFERENCE_CELL_HEIGHT_NO_HAND_PX)).toBe(0.5);
    expect(computeScale(10000, 1)).toBe(2.5);
  });
});
