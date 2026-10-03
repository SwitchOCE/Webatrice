import { ZoneName } from '@cockatrice/sockatrice';
import { renderHook } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';
import { games } from '@cockatrice/datatrice';

import { makeReduxWebClientHookWrapper } from '../../../../__test-utils__/makeHookWrapper';
import { makeDialogTestEnv, makeSetterSpies } from '../../__test-utils__/dialogTestEnv';
import type { RevealState, ZoneMenuState, ZoneViewTarget } from './gameDialogs.types';
import { useZoneDialogActions } from './useZoneDialogActions';

function setup({ zoneViews = [] as ZoneViewTarget[], zoneMenu = null as ZoneMenuState | null } = {}) {
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
    () => useZoneDialogActions({ env, zoneViews, zoneMenu, set, closeAllContextMenus }),
    { wrapper: Wrapper },
  );
  return { result, set, webClient, closeAllContextMenus, dispatch };
}

describe('useZoneDialogActions', () => {
  it('dumps the local library when its view first opens, and not when it is already open', () => {
    const first = setup();
    first.result.current.handleZoneClick(1, ZoneName.DECK);
    expect(first.webClient.request.game.dumpZone).toHaveBeenCalledWith(1, {
      playerId: 1, zoneName: ZoneName.DECK, numberCards: -1, isReversed: false,
    });

    const again = setup({ zoneViews: [{ playerId: 1, zoneName: ZoneName.DECK }] });
    again.result.current.handleZoneClick(1, ZoneName.DECK);
    expect(again.webClient.request.game.dumpZone).not.toHaveBeenCalled();
  });

  it('shuffles on close only when asked, and always clears the library snapshot', () => {
    const { result, webClient, dispatch } = setup();

    result.current.handleCloseZoneView(1, ZoneName.DECK, true);

    expect(webClient.request.game.shuffle).toHaveBeenCalledWith(1, { zoneName: ZoneName.DECK, start: 0, end: -1 });
    expect(dispatch).toHaveBeenCalledWith(games.Actions.zoneViewCleared({ gameId: 1, playerId: 1, zoneName: ZoneName.DECK }));
  });

  it('opens the zone menu only for the local deck, graveyard and exile', () => {
    const { result, set } = setup();
    const event = { preventDefault: vi.fn(), clientX: 3, clientY: 4 } as unknown as React.MouseEvent;

    result.current.handleZoneContextMenu(1, ZoneName.HAND, event);
    result.current.handleZoneContextMenu(2, ZoneName.GRAVE, event);
    expect(set.setZoneMenu).not.toHaveBeenCalled();

    result.current.handleZoneContextMenu(1, ZoneName.EXILE, event);
    expect(set.setZoneMenu).toHaveBeenCalledWith({ playerId: 1, zoneName: ZoneName.EXILE, anchorPosition: { top: 4, left: 3 } });
  });

  it('reveals a random card from the menu zone with the -2 sentinel', () => {
    const zoneMenu = { playerId: 1, zoneName: ZoneName.GRAVE, anchorPosition: { top: 0, left: 0 } };
    const { result, set, webClient } = setup({ zoneMenu });

    result.current.handleRequestRevealRandomFromZone();
    const reveal = set.setRevealState.mock.calls[0][0] as RevealState;
    expect(reveal.title).toBe('Reveal random card from graveyard');
    reveal.onSubmit({ targetPlayerId: 2, topCards: 1 });

    expect(webClient.request.game.revealCards).toHaveBeenCalledWith(1, {
      zoneName: ZoneName.GRAVE, cardId: [-2], playerId: 2, topCards: -1,
    });
  });
});
