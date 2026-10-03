import { renderHook } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';
import { games } from '@cockatrice/datatrice';

import { makeReduxWebClientHookWrapper } from '../../../../__test-utils__/makeHookWrapper';
import { makeDialogTestEnv, makeSetterSpies } from '../../__test-utils__/dialogTestEnv';
import { useGameLifecycleDialogActions } from './useGameLifecycleDialogActions';

function setup(canOpenMenus = true) {
  const { env, webClient } = makeDialogTestEnv();
  const set = makeSetterSpies();
  const closeAllContextMenus = vi.fn();
  const { Wrapper, store } = makeReduxWebClientHookWrapper({
    reducer: combineReducers({ games: games.gamesReducer }),
    preloadedState: { games: { games: {}, pings: {} } },
    webClient,
  });
  const dispatch = vi.spyOn(store, 'dispatch');
  const { result } = renderHook(
    () => useGameLifecycleDialogActions({ env, canOpenMenus, set, closeAllContextMenus }),
    { wrapper: Wrapper },
  );
  return { result, set, webClient, dispatch };
}

describe('useGameLifecycleDialogActions', () => {
  it('blocks the player menu when the user may not act', () => {
    const { result, set } = setup(false);
    result.current.handlePlayerContextMenu({ preventDefault: vi.fn() } as unknown as React.MouseEvent);
    expect(set.setPlayerMenu).not.toHaveBeenCalled();
  });

  it('remembers the last die and closes the roll dialog', () => {
    const { result, set, webClient } = setup();

    result.current.handleRollDieSubmit({ sides: 6, count: 2 });

    expect(webClient.request.game.rollDie).toHaveBeenCalledWith(1, { sides: 6, count: 2 });
    expect(set.setLastDieSides).toHaveBeenCalledWith(6);
    expect(set.setLastDieCount).toHaveBeenCalledWith(2);
    expect(set.setRollDieOpen).toHaveBeenCalledWith(false);
  });

  it('creates a token on the table with no target card', () => {
    const { result, webClient } = setup();

    result.current.handleCreateTokenSubmit({
      name: 'Goblin', color: 'r', pt: '1/1', annotation: '', destroyOnZoneChange: true, faceDown: false,
    });

    expect(webClient.request.game.createToken).toHaveBeenCalledWith(1, expect.objectContaining({
      zone: 'table', cardName: 'Goblin', targetCardId: -1, cardProviderId: '',
    }));
  });

  it('leaves the game and dispatches gameLeft locally, as useLeaveGame does', () => {
    const { result, webClient, dispatch, set } = setup();

    result.current.confirmLeave();

    expect(webClient.request.game.leaveGame).toHaveBeenCalledWith(1);
    expect(dispatch).toHaveBeenCalledWith(games.Actions.gameLeft({ gameId: 1 }));
    expect(set.setLeaveConfirm).toHaveBeenCalledWith(false);
  });
});
