import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { planSeatMove, type SeatDragSource } from '../../hooks/seatDropPlan';
import { battlefieldRows, moveDestinations, moveTarget, positionCount, type MoveBoard } from './moveCardsTarget';

const PLAYERS = [{ playerId: 2, name: 'Bob' }, { playerId: 1, name: 'Alice' }];

const source = (zone: SeatDragSource['zone'], ids: string[], extra: Partial<SeatDragSource> = {}): SeatDragSource =>
  ({ kind: 'seat', seatPlayerId: 1, zone, cards: ids.map((id) => ({ id })), ...extra });

const BOARD: MoveBoard = {
  players: PLAYERS,
  handSize: 4,
  stackSize: 2,
  deckSize: 30,
  // Bob's table: columns 0 and 1 of row 1 are taken.
  battlefield: (playerId) => (playerId === 2 ? [makeCard({ id: 20, x: 0, y: 1 }), makeCard({ id: 21, x: 3, y: 1 })] : []),
};

const labels = (s: SeatDragSource) =>
  moveDestinations(s, PLAYERS).map((d) => (d.zone === 'battlefield' ? `battlefield:${d.playerId}` : d.zone));

describe('moveDestinations', () => {
  it('offers every player\'s battlefield, the owner\'s first, then the owner\'s zones', () => {
    expect(labels(source('hand', ['5']))).toEqual(
      ['battlefield:1', 'battlefield:2', 'hand', 'stack', 'library', 'graveyard', 'exile'],
    );
  });

  it('leaves out the zone the cards are in unless it has positions', () => {
    expect(labels(source('graveyard', ['5']))).not.toContain('graveyard');
    expect(labels(source('stack', ['5']))).not.toContain('stack');
    expect(labels(source('library', ['0']))).toContain('library');
  });

  it('offers a lent card only the battlefields, as its drag', () => {
    expect(labels(source('library', ['3'], { lenderPlayerId: 2 }))).toEqual(['battlefield:1', 'battlefield:2']);
  });
});

describe('positionCount', () => {
  it('counts the places in a zone, without the moved cards already in it, plus the end', () => {
    expect(positionCount({ zone: 'hand' }, source('battlefield', ['5']), BOARD, 0)).toBe(5);
    expect(positionCount({ zone: 'hand' }, source('hand', ['5', '6']), BOARD, 0)).toBe(3);
    expect(positionCount({ zone: 'library' }, source('hand', ['5']), BOARD, 0)).toBe(31);
    expect(positionCount({ zone: 'graveyard' }, source('hand', ['5']), BOARD, 0)).toBe(0);
  });

  it('offers a battlefield row\'s columns and a new one after them', () => {
    expect(positionCount({ zone: 'battlefield', playerId: 2 }, source('hand', ['5']), BOARD, 1)).toBe(3);
    expect(positionCount({ zone: 'battlefield', playerId: 2 }, source('hand', ['5']), BOARD, 0)).toBe(1);
  });
});

describe('battlefieldRows', () => {
  it('names the rows by what desktop plays there, inverted with the board', () => {
    expect(battlefieldRows(false)).toEqual([
      { kind: 'lands', row: 2 }, { kind: 'creatures', row: 1 }, { kind: 'other', row: 0 },
    ]);
    expect(battlefieldRows(true).map((r) => r.row)).toEqual([0, 1, 2]);
  });
});

describe('moveTarget, through planSeatMove', () => {
  it('puts a hand card on another player\'s battlefield at the chosen row and column', () => {
    const s = source('hand', ['5']);
    expect(planSeatMove(s, moveTarget({ zone: 'battlefield', playerId: 2 }, s, { position: 3, row: 1 }))).toEqual([
      expect.objectContaining({
        startPlayerId: 1, startZone: ZoneName.HAND, targetPlayerId: 2, targetZone: ZoneName.TABLE, x: 6, y: 1,
      }),
    ]);
  });

  it('inserts into the hand and the stack at a 0-based index, and the library from the top', () => {
    const s = source('battlefield', ['5']);
    expect(planSeatMove(s, moveTarget({ zone: 'hand' }, s, { position: 1, row: 0 }))[0])
      .toEqual(expect.objectContaining({ targetZone: ZoneName.HAND, x: 0 }));
    expect(planSeatMove(s, moveTarget({ zone: 'stack' }, s, { position: 2, row: 0 }))[0])
      .toEqual(expect.objectContaining({ targetZone: ZoneName.STACK, x: 1 }));
    expect(planSeatMove(s, moveTarget({ zone: 'library' }, s, { position: 4, row: 0 }))[0])
      .toEqual(expect.objectContaining({ targetZone: ZoneName.DECK, x: 3 }));
  });

  it('reorders the hand by its shown order', () => {
    const s = source('hand', ['7']);
    const plan = planSeatMove(s, moveTarget({ zone: 'hand' }, s, { position: 1, row: 0, handOrder: ['5', '6', '7'] }));
    expect(plan).toEqual([expect.objectContaining({ cardsToMove: { card: [{ cardId: 7 }] }, targetZone: ZoneName.HAND, x: 0 })]);
  });

  it('moves a lent card out of the lender\'s library onto a battlefield', () => {
    const s = source('library', ['3'], { lenderPlayerId: 2 });
    expect(planSeatMove(s, moveTarget({ zone: 'battlefield', playerId: 1 }, s, { position: 1, row: 2 }))).toEqual([
      expect.objectContaining({ startPlayerId: 2, startZone: ZoneName.DECK, targetPlayerId: 1, targetZone: ZoneName.TABLE, x: 0, y: 2 }),
    ]);
  });
});
