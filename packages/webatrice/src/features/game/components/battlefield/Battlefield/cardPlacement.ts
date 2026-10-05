// Which battlefield row (or the stack) a card is played to.
//
// cards.xml `<tablerow>` is authoritative. Oracle's importer assigns 0 to
// lands, 1 to other permanents, 2 to creatures and 3 to instants/sorceries.
// Without a database row, infer the same row from the type line using
// Oracle's maintype priority (including creature lands and artifact creatures).
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

/** Desktop `TableZone::tableRowToGridY` (table_zone.cpp:459-464): row r sits at
 *  visual row 2 - r, and rows past 2 fold to the middle. */
export function tableRowToGridY(tableRow: number): number {
  const clamped = tableRow > 2 ? 1 : tableRow;
  return Math.max(0, Math.min(2, 2 - clamped));
}

export type CardPlacement = { zone: 'stack' } | { zone: 'table'; visualY: number };

/** What a card's catalog entry says about how it enters the battlefield. */
export interface PlayedCardMeta {
  /** Printed P/T. */
  pt?: string;
  /** cards.xml `<cipt>`: the card comes into play tapped. */
  cipt?: boolean;
}

/**
 * The fields of a card played face up onto the battlefield (desktop
 * PlayerActions::playCard, player_actions.cpp:120-130): its printed P/T, and
 * tapped when it comes into play tapped. A face-down card carries neither.
 * Every face-up play onto the battlefield sends these.
 */
export function playedCardFields(meta: PlayedCardMeta | undefined, faceDown: boolean): { pt?: string; tapped?: true } {
  if (faceDown || !meta) {
    return {};
  }
  return { ...(meta.pt && { pt: meta.pt }), ...(meta.cipt && { tapped: true as const }) };
}

export interface CardPlacementMeta {
  tableRow?: number | null;
  typeLine?: string;
}

/** Use the imported row even when it differs from the card's type line. */
export function resolveCardTableRow(meta: CardPlacementMeta | undefined): number {
  return meta?.tableRow ?? tableRowFromTypeLine(meta?.typeLine ?? '');
}

/** Row 3 plays to the stack; face-down plays always use creature row 2. */
export function placementForCard(meta: CardPlacementMeta | undefined, faceDown = false): CardPlacement {
  const tableRow = faceDown ? 2 : resolveCardTableRow(meta);
  if (tableRow === STACK_TABLE_ROW) {
    return { zone: 'stack' };
  }
  return { zone: 'table', visualY: tableRowToGridY(tableRow) };
}

/**
 * Oracle's getMainCardType priority and row assignment
 * (oracleimporter.cpp:150-176,254-262). Only types, not subtypes, participate;
 * across multiple faces the highest-priority maintype wins too.
 */
export function tableRowFromTypeLine(typeLine: string): TableRow {
  const types = new Set(typeLine.toLowerCase().split('//').flatMap((face) => face.split(/[—–]/)[0].trim().split(/\s+/)));
  if (types.has('planeswalker')) {
    return 1;
  }
  if (types.has('creature')) {
    return 2;
  }
  if (types.has('land')) {
    return 0;
  }
  if (types.has('sorcery') || types.has('instant')) {
    return 3;
  }
  return 1;
}
