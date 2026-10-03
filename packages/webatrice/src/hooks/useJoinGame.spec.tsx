import { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { createStore, games, rooms } from '@cockatrice/datatrice';
import { WebClientContext } from '@cockatrice/datatrice/react';
import {
  Event_GameJoinedSchema,
  ServerInfo_GameSchema,
  type ServerInfo_Game,
} from '@cockatrice/sockatrice/generated';

import { rootReducerMap, type RootState } from '../store';
import { createMockWebClient, connectedState } from '../__test-utils__';
import { useJoinGame, useNavigateOnGameJoined } from './useJoinGame';

const reducer = combineReducers(rootReducerMap);

function setup<T>(hook: () => T, preloadedState: Partial<RootState> = connectedState) {
  const webClient = createMockWebClient();
  const store = createStore<RootState>({ reducer: reducer as any, preloadedState });
  const location = { pathname: '' };
  function LocationProbe() {
    location.pathname = useLocation().pathname;
    return null;
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <WebClientContext value={webClient}>
          <MemoryRouter initialEntries={['/room/1']}>
            <LocationProbe />
            {children}
          </MemoryRouter>
        </WebClientContext>
      </Provider>
    );
  }
  const { result } = renderHook(hook, { wrapper: Wrapper });
  return { result, store, webClient, location };
}

const makeGame = (overrides: MessageInitShape<typeof ServerInfo_GameSchema> = {}): ServerInfo_Game =>
  create(ServerInfo_GameSchema, { gameId: 7, roomId: 2, playerCount: 1, maxPlayers: 2, spectatorsAllowed: true, ...overrides });

describe('useJoinGame', () => {
  it('sends Command_JoinGame to the room of the game', () => {
    const { result, webClient } = setup(() => useJoinGame());
    act(() => result.current.beginJoin(2, makeGame(), false, false));
    expect(webClient.request.rooms.joinGame).toHaveBeenCalledWith(2, {
      gameId: 7, password: '', spectator: false, overrideRestrictions: false, joinAsJudge: false,
    });
  });

  it('joins a full game as a spectator', () => {
    const { result, webClient } = setup(() => useJoinGame());
    act(() => result.current.beginJoin(2, makeGame({ playerCount: 2 }), false, false));
    expect(webClient.request.rooms.joinGame).toHaveBeenCalledWith(2, expect.objectContaining({ spectator: true }));
  });

  it('asks for the password first and sends it with the join', () => {
    const { result, webClient } = setup(() => useJoinGame());
    act(() => result.current.beginJoin(2, makeGame({ withPassword: true }), false, true));
    expect(result.current.passwordRequired).toBe(true);
    expect(webClient.request.rooms.joinGame).not.toHaveBeenCalled();

    act(() => result.current.submitPassword('hunter2'));
    expect(result.current.passwordRequired).toBe(false);
    expect(webClient.request.rooms.joinGame).toHaveBeenCalledWith(2, expect.objectContaining({
      password: 'hunter2', joinAsJudge: true,
    }));
  });

  it('does not ask spectators for a password the game does not require of them', () => {
    const { result, webClient } = setup(() => useJoinGame());
    act(() => result.current.beginJoin(2, makeGame({ withPassword: true, spectatorsNeedPassword: false }), true, false));
    expect(result.current.passwordRequired).toBe(false);
    expect(webClient.request.rooms.joinGame).toHaveBeenCalled();
  });

  it('cancelling the password prompt sends nothing', () => {
    const { result, webClient } = setup(() => useJoinGame());
    act(() => result.current.beginJoin(2, makeGame({ withPassword: true }), false, false));
    act(() => result.current.cancelPassword());
    expect(result.current.passwordRequired).toBe(false);
    expect(webClient.request.rooms.joinGame).not.toHaveBeenCalled();
  });

  it('routes to a game that is already open instead of joining it again', () => {
    const state = { ...connectedState, games: { games: { 7: {} as never }, pings: {} } } as Partial<RootState>;
    const { result, webClient, location } = setup(() => useJoinGame(), state);
    act(() => result.current.beginJoin(2, makeGame(), false, false));
    expect(webClient.request.rooms.joinGame).not.toHaveBeenCalled();
    expect(location.pathname).toBe('/game/7');
  });
});

describe('useJoinGame with several lists mounted', () => {
  const setupTwoLists = () => setup(() => ({ roomList: useJoinGame(), userGames: useJoinGame() }));
  const rejectJoin = (store: ReturnType<typeof setup>['store']) => act(() => {
    store.dispatch(rooms.Actions.setJoinGameError({ code: 12, message: 'Wrong password.' }));
  });

  it('reports a rejected join only in the list that sent it', () => {
    const { result, store } = setupTwoLists();
    act(() => result.current.userGames.beginJoin(2, makeGame(), false, false));
    rejectJoin(store);
    expect(result.current.userGames.joinError).toEqual({ code: 12, message: 'Wrong password.' });
    expect(result.current.roomList.joinError).toBeNull();
  });

  it('moves the error to whichever list sent the latest join', () => {
    const { result, store } = setupTwoLists();
    act(() => result.current.userGames.beginJoin(2, makeGame(), false, false));
    act(() => result.current.roomList.beginJoin(2, makeGame(), false, false));
    rejectJoin(store);
    expect(result.current.roomList.joinError).not.toBeNull();
    expect(result.current.userGames.joinError).toBeNull();
  });
});

describe('useNavigateOnGameJoined', () => {
  it('routes once to the joined game however many lists are listening', () => {
    const onJoined = vi.fn();
    const { store, location } = setup(() => {
      useNavigateOnGameJoined(onJoined);
      useNavigateOnGameJoined();
    });
    act(() => {
      store.dispatch(games.Actions.gameJoined({
        data: create(Event_GameJoinedSchema, { gameInfo: create(ServerInfo_GameSchema, { gameId: 9 }) }),
      }) as never);
    });
    expect(location.pathname).toBe('/game/9');
    expect(onJoined).toHaveBeenCalledWith(9);
  });
});
