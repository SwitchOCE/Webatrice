import {
  legacyTableRowFromTypeLine,
  parseTableRow,
  placementFromCardDatabaseRow,
  tableRowToGridY,
  tokenGridYFromCardDatabaseRow,
} from './cardPlacement';
import { applyInvertY } from './gridMath';

describe('cardPlacement', () => {
  it.each([
    ['0', 0],
    ['3', 3],
    ['12', 12],
    ['', null],
    [' 1', null],
    ['-1', null],
    ['x', null],
    [undefined, null],
    [null, null],
  ])('parses tablerow %j as %j', (raw, expected) => {
    expect(parseTableRow(raw)).toBe(expected);
  });

  it.each([
    [0, 2],
    [1, 1],
    [2, 0],
    [3, 1],
    [7, 1],
  ])('tableRowToGridY(%i) = %i', (row, y) => {
    expect(tableRowToGridY(row)).toBe(y);
  });

  describe('card-database policy (playCardViaTableRow)', () => {
    it.each([
      [0, { zone: 'table', visualY: 2 }],
      [1, { zone: 'table', visualY: 1 }],
      [2, { zone: 'table', visualY: 0 }],
      [3, { zone: 'stack' }],
      [4, { zone: 'table', visualY: 0 }],
      [null, { zone: 'table', visualY: 0 }],
    ] as const)('row %j plays to %j', (row, placement) => {
      expect(placementFromCardDatabaseRow(row)).toEqual(placement);
    });

    it('token rows fold past 2 to the middle; face-down and unknown use the top row', () => {
      expect([0, 1, 2, 3, 9, null].map((row) => tokenGridYFromCardDatabaseRow(row, false))).toEqual([2, 1, 0, 1, 1, 0]);
      expect(tokenGridYFromCardDatabaseRow(0, true)).toBe(0);
    });
  });

  describe('legacy type-line policy (seat double-click)', () => {
    it.each([
      ['Basic Land — Forest', 0],
      ['Artifact', 1],
      ['Enchantment — Aura', 1],
      ['Legendary Planeswalker — Jace', 1],
      ['Creature — Bear', 2],
      ['Artifact Creature — Golem', 2],
      ['Land Creature — Forest Dryad', 2],
      ['Instant', 3],
      ['Sorcery — Adventure', 3],
      ['', 1],
    ] as const)('%j is row %i', (typeLine, row) => {
      expect(legacyTableRowFromTypeLine(typeLine)).toBe(row);
    });
  });

  it('keeps the two policies apart for creatures and other permanents', () => {
    // Pinned divergence, not a bug to fix here: see the refactor plan §10.
    const legacyCreatureY = tableRowToGridY(legacyTableRowFromTypeLine('Creature — Bear'));
    const databaseCreature = placementFromCardDatabaseRow(1);
    expect(legacyCreatureY).toBe(0);
    expect(databaseCreature).toEqual({ zone: 'table', visualY: 1 });

    const legacyArtifactY = tableRowToGridY(legacyTableRowFromTypeLine('Artifact'));
    expect(legacyArtifactY).toBe(1);
    expect(placementFromCardDatabaseRow(2)).toEqual({ zone: 'table', visualY: 0 });
  });

  it('leaves y-inversion to the caller, which applies it exactly once', () => {
    const placement = placementFromCardDatabaseRow(0);
    if (placement.zone !== 'table') {
      throw new Error('expected a table placement');
    }
    expect(applyInvertY(placement.visualY, false)).toBe(2);
    expect(applyInvertY(placement.visualY, true)).toBe(0);
    // A second inversion would undo the first.
    expect(applyInvertY(applyInvertY(placement.visualY, true), true)).toBe(placement.visualY);
  });
});
