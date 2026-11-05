import { act } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { games, server } from '@cockatrice/datatrice';
import { makeCard } from '@cockatrice/datatrice/testing';
import { ZoneName } from '@cockatrice/sockatrice';
import { Event_MoveCardSchema } from '@cockatrice/sockatrice/generated';
import { renderSeatHook, type SeatGameSpec } from '../../../__test-utils__/seatFixtures';
import { useMoveCard } from './useMoveCard';

const SPEC: SeatGameSpec = {
  localPlayerId: 1,
  seats: [
    { playerId: 1, hand: [makeCard({ id: 5, name: 'Bolt' }), makeCard({ id: 6 }), makeCard({ id: 7 })] },
    { playerId: 2, table: [makeCard({ id: 5, name: 'Ogre' })] },
  ],
};

function renderMoves(spec: SeatGameSpec = SPEC) {
  const utils = renderSeatHook(() => [useMoveCard(1)!, useMoveCard(2)!] as const, spec, state => {
    state.games.games[2] = { ...state.games.games[1], info: { ...state.games.games[1].info, gameId: 2 } };
  });
  const zone = (name: string, gameId = 1, playerId = 1) => utils.store.getState().games.games[gameId].players[playerId].zones[name];
  const move = (startZone: string, targetZone: string, x = 0, gameId = 1, targetPlayerId = 1) => act(() => utils.result()[gameId - 1]({
    startPlayerId: 1, startZone, targetPlayerId, targetZone, x, y: 0, cardsToMove: { card: [{ cardId: 5 }] },
  }));
  const echo = (startZone: string, targetZone: string, x = 0, gameId = 1, targetPlayerId = 1, newCardId = 5) =>
    act(() => utils.store.dispatch(games.Actions.cardMoved({
      gameId, playerId: 1,
      data: create(Event_MoveCardSchema, {
        startPlayerId: 1, startZone, targetPlayerId, targetZone, cardId: 5, newCardId, cardName: 'Bolt', x, y: 0, position: -1,
      }),
    })));
  const reject = (index: number) => act(() => vi.mocked(utils.game.moveCard).mock.calls[index][3]!.onError!(1, {} as never));
  const expectPosition = (expected: string, gameId = 1) => {
    for (const name of [ZoneName.HAND, ZoneName.STACK, ZoneName.GRAVE, ZoneName.EXILE]) {
      expect(zone(name, gameId).order.filter(id => id === 5)).toEqual(name === expected ? [5] : []);
      expect(zone(name, gameId).cardCount).toBe((name === ZoneName.HAND ? 2 : 0) + Number(name === expected));
      expect(zone(name, gameId).byId[5] !== undefined).toBe(name === expected);
    }
    expect(zone(ZoneName.DECK, gameId).cardCount).toBe(40);
  };
  return { ...utils, zone, move, echo, reject, expectPosition };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMoveCard with server echoes', () => {
  it.each([2, 3])('keeps one card at the final destination through %i delayed move echoes', count => {
    const { move, echo, expectPosition, zone } = renderMoves();
    const path = [ZoneName.HAND, ZoneName.STACK, ZoneName.GRAVE, ZoneName.EXILE].slice(0, count + 1);
    for (let index = 0; index < count; index++) {
      move(path[index], path[index + 1]);
    }
    expectPosition(path[count]);
    for (let index = 0; index < count; index++) {
      echo(path[index], path[index + 1], 9);
      expectPosition(path[count]);
      expect(zone(path[count]).byId[5].x).toBe(index === count - 1 ? 9 : 0);
    }
    expect(games.isOptimisticPending(games.moveOpKey(1, 1, 5))).toBe(false);
  });

  it.each([0, 1])('rolls back rejection %i and every later move, with stale failures doing nothing', rejected => {
    const { move, reject, expectPosition, zone } = renderMoves();
    move(ZoneName.HAND, ZoneName.STACK);
    move(ZoneName.STACK, ZoneName.GRAVE);
    move(ZoneName.GRAVE, ZoneName.EXILE);
    reject(rejected);
    expectPosition(rejected === 0 ? ZoneName.HAND : ZoneName.STACK);
    reject(2);
    expectPosition(rejected === 0 ? ZoneName.HAND : ZoneName.STACK);
    if (rejected === 0) {
      expect(zone(ZoneName.HAND).order).toEqual([5, 6, 7]);
    }
  });

  it('retains the confirmed first move when the second move is rejected after its first echo', () => {
    const { move, echo, reject, expectPosition } = renderMoves();
    move(ZoneName.HAND, ZoneName.STACK);
    move(ZoneName.STACK, ZoneName.GRAVE);
    echo(ZoneName.HAND, ZoneName.STACK);
    reject(1);
    expectPosition(ZoneName.STACK);
    reject(0);
    expectPosition(ZoneName.STACK);
  });

  it('ignores an old failure while a newer operation is pending for the same card', () => {
    const { move, echo, reject, expectPosition } = renderMoves();
    move(ZoneName.HAND, ZoneName.STACK);
    echo(ZoneName.HAND, ZoneName.STACK);
    move(ZoneName.STACK, ZoneName.GRAVE);
    reject(0);
    expectPosition(ZoneName.GRAVE);
    echo(ZoneName.STACK, ZoneName.GRAVE);
    expectPosition(ZoneName.GRAVE);
  });

  it('keeps a newer same-zone reorder while the first echo arrives', () => {
    const { move, echo, zone } = renderMoves();
    move(ZoneName.HAND, ZoneName.HAND, 2);
    move(ZoneName.HAND, ZoneName.HAND, 1);
    expect(zone(ZoneName.HAND).order).toEqual([6, 5, 7]);
    echo(ZoneName.HAND, ZoneName.HAND, 2);
    expect(zone(ZoneName.HAND).order).toEqual([6, 5, 7]);
    echo(ZoneName.HAND, ZoneName.HAND, 1);
    expect(zone(ZoneName.HAND).order).toEqual([6, 5, 7]);
    expect(zone(ZoneName.HAND).cardCount).toBe(3);
  });

  it('isolates moves and failures in two games with the same player and card ids', () => {
    const { move, echo, reject, expectPosition } = renderMoves();
    move(ZoneName.HAND, ZoneName.STACK);
    move(ZoneName.HAND, ZoneName.STACK, 0, 2);
    echo(ZoneName.HAND, ZoneName.STACK);
    reject(1);
    expectPosition(ZoneName.STACK);
    expectPosition(ZoneName.HAND, 2);
  });

  it.each([ZoneName.EXILE, ZoneName.STACK, ZoneName.GRAVE])('reconciles a remote move to %s and ignores stale failures', target => {
    const { move, echo, reject, expectPosition, zone } = renderMoves();
    move(ZoneName.HAND, ZoneName.STACK);
    move(ZoneName.STACK, ZoneName.GRAVE);
    echo(ZoneName.HAND, target, 8);
    if (target === ZoneName.STACK) {
      expectPosition(ZoneName.GRAVE);
      echo(ZoneName.STACK, ZoneName.EXILE, 8);
    }
    const finalZone = target === ZoneName.GRAVE ? ZoneName.GRAVE : ZoneName.EXILE;
    expectPosition(finalZone);
    expect(zone(finalZone).byId[5].x).toBe(8);
    reject(0);
    reject(1);
    expectPosition(finalZone);
  });

  it('chains a cross-player move and echo when both players have card id 5', () => {
    const { move, echo, zone, game } = renderMoves({
      localPlayerId: 1,
      seats: [
        { playerId: 1, table: [makeCard({ id: 5, name: 'Bolt' })] },
        { playerId: 2, table: [makeCard({ id: 5, name: 'Ogre' })] },
      ],
    });
    move(ZoneName.TABLE, ZoneName.TABLE, 3, 1, 2);
    expect(vi.mocked(game.moveCard).mock.calls[0][3]).toBeUndefined();
    expect(zone(ZoneName.TABLE).order).toEqual([5]);
    echo(ZoneName.TABLE, ZoneName.TABLE, 3, 1, 2, 130);
    expect(zone(ZoneName.TABLE).order).toEqual([]);
    expect(zone(ZoneName.TABLE).cardCount).toBe(0);
    const target = zone(ZoneName.TABLE, 1, 2);
    expect(target.order).toEqual([5, 130]);
    expect(target.byId[5].name).toBe('Ogre');
    expect(target.byId[130].name).toBe('Bolt');
    expect(target.cardCount).toBe(2);
  });

  it.each([games.Actions.gameLeft, games.Actions.gameClosed, games.Actions.kicked])('clears only the removed game for $type', remove => {
    const { move, store, reject, expectPosition } = renderMoves();
    move(ZoneName.HAND, ZoneName.STACK);
    move(ZoneName.HAND, ZoneName.STACK, 0, 2);
    act(() => store.dispatch(remove({ gameId: 1 })));
    expect(games.isOptimisticPending(games.moveOpKey(1, 1, 5))).toBe(false);
    expect(games.isOptimisticPending(games.moveOpKey(2, 1, 5))).toBe(true);
    reject(0);
    expectPosition(ZoneName.STACK, 2);
  });

  it('clears disconnect bookkeeping after pending failures settle and ignores late failures', () => {
    const { move, store, reject } = renderMoves();
    move(ZoneName.HAND, ZoneName.STACK);
    move(ZoneName.STACK, ZoneName.GRAVE);
    reject(0);
    reject(1);
    move(ZoneName.HAND, ZoneName.STACK, 0, 2);
    act(() => store.dispatch(server.Actions.disconnected()));
    expect(games.isOptimisticPending(games.moveOpKey(1, 1, 5))).toBe(false);
    expect(games.isOptimisticPending(games.moveOpKey(2, 1, 5))).toBe(false);
    const state = store.getState();
    reject(2);
    expect(store.getState()).toBe(state);
  });
});
