import { deckColumnCount, deckGroupWeight, partitionIntoColumns } from './deckColumns';

describe('deckColumnCount', () => {
  it('fits as many columns as the width allows, but no more than there are groups', () => {
    expect(deckColumnCount(527, 'comfortable', 9)).toBe(2);
    expect(deckColumnCount(1236, 'comfortable', 9)).toBe(4);
    expect(deckColumnCount(1236, 'comfortable', 3)).toBe(3);
    expect(deckColumnCount(0, 'comfortable', 9)).toBe(1);
    expect(deckColumnCount(800, 'comfortable', 0)).toBe(1);
  });

  it('fits more columns with compact rows', () => {
    expect(deckColumnCount(720, 'comfortable', 9)).toBe(2);
    expect(deckColumnCount(720, 'compact', 9)).toBe(3);
  });
});

describe('deckGroupWeight', () => {
  it('counts a collapsed group as its header only', () => {
    expect(deckGroupWeight(12, false)).toBeGreaterThan(deckGroupWeight(12, true));
    expect(deckGroupWeight(12, true)).toBe(deckGroupWeight(0, false));
  });
});

describe('partitionIntoColumns', () => {
  it('keeps the group order and balances the tallest column', () => {
    const weights = [10, 4, 6, 5, 3, 4, 8, 6];
    const columns = partitionIntoColumns(weights, 4);
    expect(columns).toHaveLength(4);
    expect(columns.flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(Math.max(...columns.map((column) => column.reduce((sum, g) => sum + weights[g], 0)))).toBe(14);
    expect(partitionIntoColumns([28, 4, 6, 5, 3, 4, 18, 5], 3)).toEqual([[0], [1, 2, 3, 4, 5], [6, 7]]);
  });

  it('uses every column it is given when there are enough groups', () => {
    const columns = partitionIntoColumns([1, 1, 1, 1, 1], 5);
    expect(columns).toHaveLength(5);
    expect(columns.flat()).toEqual([0, 1, 2, 3, 4]);
  });

  it('never makes more columns than groups', () => {
    expect(partitionIntoColumns([3, 2], 4)).toEqual([[0], [1]]);
    expect(partitionIntoColumns([], 3)).toEqual([]);
  });
});
