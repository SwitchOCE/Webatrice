// Desktop's "Move to" on the selected cards of one zone
// (PlayerActions::cardMenuAction, player_actions.cpp:1825-1950), shared by
// the hand and zone-view card menu, the battlefield card menu and the
// move-selection shortcuts, so they send the same commands.

import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';

import {
  resolveCardTableRow,
  playedCardFields,
  tableRowToGridY,
  type PlayedCardMeta,
} from '../../battlefield/Battlefield/cardPlacement';
import type { PlayerZoneCommands, SeatMoveCard, SeatMoveDestination } from './playerBoard.types';

/** What moving a card onto the battlefield needs from its catalog entry. */
export interface TableMoveMeta extends PlayedCardMeta {
  typeLine: string;
  /** cards.xml `<tablerow>`, when the card database has the card. */
  tableRow?: number;
}

/**
 * The Command_MoveCard that puts one card onto the battlefield from another
 * zone (desktop cmMoveToTable, player_actions.cpp:1928-1951): face up, in its
 * table row, with its printed P/T, tapped when it comes into play tapped.
 * Unlike a play, an instant or sorcery lands on the battlefield too, in the
 * row tableRowToGridY folds row 3 into. The row is cards.xml's `tablerow`, as
 * desktop reads it from the card database; a card the database lacks (a
 * Scryfall-only card) falls back to the type-line rule (cardPlacement.ts).
 */
export function tableMove(cardId: number, meta: TableMoveMeta | undefined): { card: SeatMoveCard; to: SeatMoveDestination } {
  const fields = playedCardFields(meta, false);
  const tableRow = resolveCardTableRow(meta);
  return {
    card: fields.pt || fields.tapped ? { id: cardId, ...fields } : cardId,
    to: { zone: ZoneName.TABLE, index: 'end', row: tableRowToGridY(tableRow) },
  };
}

/**
 * Move these cards of `from` to `to`, as desktop's "Move to" does:
 *   - onto the battlefield from another zone, one Command_MoveCard per card
 *     (tableMove), since row, P/T and cipt differ per card;
 *   - anywhere else, one Command_MoveCard for all of them; to the top or
 *     bottom of the library, more than one card also shuffles the moved
 *     block in the same container (player_actions.cpp:1853-1888).
 * Cards without a server id are skipped.
 */
export function moveSelectedCards(
  moveCards: PlayerZoneCommands['moveCards'],
  from: ZoneNameValue,
  cards: readonly { id: string; name: string }[],
  to: SeatMoveDestination,
  cardMeta: (name: string) => TableMoveMeta | undefined,
): void {
  const targets = cards.filter((c) => Number.isFinite(Number(c.id)));
  if (targets.length === 0) {
    return;
  }
  if (to.zone === ZoneName.TABLE && from !== ZoneName.TABLE) {
    for (const c of targets) {
      const move = tableMove(Number(c.id), cardMeta(c.name));
      moveCards(from, [move.card], move.to);
    }
    return;
  }
  moveCards(from, targets.map((c) => Number(c.id)), {
    reversed: false,
    ...to,
    ...(to.zone === ZoneName.DECK && targets.length > 1 && { shuffleMoved: true }),
  });
}
