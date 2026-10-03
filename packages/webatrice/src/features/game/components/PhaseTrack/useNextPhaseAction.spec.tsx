import { ZoneName } from '@cockatrice/sockatrice';
import { act, renderHook } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';
import { CardAttribute } from '@cockatrice/sockatrice/generated';
import { Phase, games, type GamesState } from '@cockatrice/datatrice';
import { makeGameEntry, makePlayerEntry, makePlayerProperties } from '@cockatrice/datatrice/testing';

import { makeReduxWebClientHookWrapper } from '../../../../__test-utils__/makeHookWrapper';
import { useNextPhaseAction } from './useNextPhaseAction';

function setup({ activePhase = Phase.Upkeep as number, activePlayerId = 1, conceded = false, spectator = false } = {}) {
  const game = makeGameEntry({
    started: true,
    activePhase,
    localPlayerId: 1,
    activePlayerId,
    spectator,
    players: { 1: makePlayerEntry({ properties: makePlayerProperties({ playerId: 1, conceded }) }) },
  });
  const gamesState: GamesState = { games: { 1: game }, pings: {} };
  const { Wrapper, webClient, store } = makeReduxWebClientHookWrapper({
    reducer: combineReducers({ games: games.gamesReducer }),
    preloadedState: { games: gamesState },
  });
  const { result } = renderHook(() => useNextPhaseAction(1), { wrapper: Wrapper });
  const order = () => {
    const sent: Array<[string, number]> = [];
    for (const name of ['setActivePhase', 'nextTurn', 'drawCards', 'setCardAttr'] as const) {
      for (const order of vi.mocked(webClient.request.game[name]).mock.invocationCallOrder) {
        sent.push([name, order]);
      }
    }
    return sent.sort((a, b) => a[1] - b[1]).map(([name]) => name);
  };
  return { result, webClient, store, order };
}

describe('useNextPhaseAction', () => {
  it('Upkeep: sets Draw, then draws one card', () => {
    const { result, webClient, order } = setup({ activePhase: Phase.Upkeep });

    act(() => result.current.run());

    expect(order()).toEqual(['setActivePhase', 'drawCards']);
    expect(webClient.request.game.setActivePhase).toHaveBeenCalledWith(1, { phase: Phase.Draw }, expect.anything());
    expect(webClient.request.game.drawCards).toHaveBeenCalledWith(1, { number: 1 });
  });

  it('End: passes the turn, then untaps the local table', () => {
    const { result, webClient, order } = setup({ activePhase: Phase.EndCleanup });

    act(() => result.current.run());

    expect(order()).toEqual(['nextTurn', 'setCardAttr']);
    expect(webClient.request.game.setCardAttr).toHaveBeenCalledWith(1, {
      zone: ZoneName.TABLE,
      cardId: -1,
      attribute: CardAttribute.AttrTapped,
      attrValue: '0',
    });
  });

  it('a phase without a double-click action only advances', () => {
    const { result, order } = setup({ activePhase: Phase.FirstMain });

    act(() => result.current.run());

    expect(order()).toEqual(['setActivePhase']);
  });

  it('steps from the phase the previous press set, before a re-render', () => {
    const { result, webClient } = setup({ activePhase: Phase.Untap });

    act(() => {
      result.current.run();
      result.current.run();
    });

    expect(vi.mocked(webClient.request.game.setActivePhase).mock.calls.map(([, p]) => p.phase))
      .toEqual([Phase.Upkeep, Phase.Draw]);
  });

  it('End off turn: still passes the turn and untaps, gated on canPassTurn alone (spec §1)', () => {
    const { result, order } = setup({ activePhase: Phase.EndCleanup, activePlayerId: 2 });

    expect(result.current.canRun).toBe(true);
    act(() => result.current.run());

    expect(order()).toEqual(['nextTurn', 'setCardAttr']);
  });

  it('End: a second press before the server answers sends nothing more', () => {
    const { result, order } = setup({ activePhase: Phase.EndCleanup });

    act(() => {
      result.current.run();
      result.current.run();
    });

    expect(order()).toEqual(['nextTurn', 'setCardAttr']);
  });

  it('End: wraps again once the server has moved the turn on and back', () => {
    const { result, store, order } = setup({ activePhase: Phase.EndCleanup });

    act(() => result.current.run());
    act(() => {
      store.dispatch(games.Actions.activePlayerSet({ gameId: 1, activePlayerId: 2 }));
    });
    act(() => {
      store.dispatch(games.Actions.activePlayerSet({ gameId: 1, activePlayerId: 1 }));
      store.dispatch(games.Actions.activePhaseSet({ gameId: 1, phase: Phase.EndCleanup }));
    });
    act(() => result.current.run());

    expect(order()).toEqual(['nextTurn', 'setCardAttr', 'nextTurn', 'setCardAttr']);
  });

  it.each([
    ['off turn', { activePlayerId: 2 }],
    ['a spectator', { spectator: true, activePlayerId: 2 }],
    ['conceded, at the wrap', { conceded: true, activePhase: Phase.EndCleanup }],
  ])('sends nothing when %s', (_label, opts) => {
    const { result, order } = setup(opts);

    expect(result.current.canRun).toBe(false);
    act(() => result.current.run());

    expect(order()).toEqual([]);
  });
});
