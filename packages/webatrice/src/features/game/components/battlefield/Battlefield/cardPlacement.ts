// Which battlefield row (or the stack) a card is played to.
//
// Two policies are live and they disagree on creatures, so both are named here
// and kept apart until the parity decision in
// docs/webatrice-solid-refactor-plan.md §10 ("Which table-row policy is
// authoritative"):
//
//   - the card-database policy reads cards.xml `<tablerow>`
//     (0 land, 1 creature, 2 other permanent, 3 instant/sorcery), and drives
//     playCardViaTableRow and token creation;
//   - the legacy type-line policy classifies a type line itself and puts
//     creatures in row 2, and drives the seat's double-click play.
//
// Rows here are owner-perspective visual rows (0 = top). Inverting them for a
// mirrored board is gridMath.applyInvertY's job, done once by the caller.
// Pure: no Dexie, no client.

/** A Cockatrice `tableRow` value. */
export type TableRow = 0 | 1 | 2 | 3;

/** The instant / sorcery row, which plays to the stack rather than the table. */
export const STACK_TABLE_ROW = 3;

/** Parse a cards.xml `<tablerow>` value; anything but digits is unknown (null). */
export function parseTableRow(raw: string | null | undefined): number | null {
  return raw != null && /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Desktop `TableZone::tableRowToGridY` (table_zone.cpp:409-415): row r sits at
 *  visual row 2 - r, and rows past 2 fold to the middle. */
export function tableRowToGridY(tableRow: number): number {
  const clamped = tableRow > 2 ? 1 : tableRow;
  return 2 - clamped;
}

export type CardPlacement = { zone: 'stack' } | { zone: 'table'; visualY: number };

/** Card-database policy for playing a card: row 3 goes to the stack, rows 0-2
 *  to visual row 2 - row, and an unknown or out-of-range row to the top row. */
export function placementFromCardDatabaseRow(tablerow: number | null): CardPlacement {
  if (tablerow === STACK_TABLE_ROW) {
    return { zone: 'stack' };
  }
  const visualY = tablerow === 0 || tablerow === 1 || tablerow === 2 ? 2 - tablerow : 0;
  return { zone: 'table', visualY };
}

/** Card-database policy for Command_CreateToken's y (desktop actCreateToken):
 *  rows past 2 fold to the middle, an unknown row and a face-down token use the
 *  top row. */
export function tokenGridYFromCardDatabaseRow(tablerow: number | null, faceDown: boolean): number {
  if (faceDown || tablerow == null) {
    return 0;
  }
  return tableRowToGridY(tablerow);
}

/**
 * Legacy type-line policy (the seat's hand / stack double-click): instants and sorceries 3,
 * creatures 2, lands 0, any other permanent 1. Checked in that order, so an
 * artifact creature or a creature land counts as a creature.
 *
 * Differs from the card database, which puts creatures in row 1 and other
 * permanents in row 2. Do not merge the two without the parity decision.
 */
export function legacyTableRowFromTypeLine(typeLine: string): TableRow {
  const t = typeLine.toLowerCase();
  if (t.includes('instant') || t.includes('sorcery')) {
    return 3;
  }
  if (t.includes('creature')) {
    return 2;
  }
  if (t.includes('land')) {
    return 0;
  }
  return 1;
}
