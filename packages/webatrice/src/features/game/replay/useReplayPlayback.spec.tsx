import { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';

import { games, type GamesState } from '@cockatrice/datatrice';
import { WebClientContext } from '@cockatrice/datatrice/react';
import type { WebClient } from '@cockatrice/sockatrice';
import { createMockWebClient } from '../../../__test-utils__';
import type { OpenedReplay } from '@app/services';
import { buildReplay, sayContainer } from '../../../services/replay/__mocks__/fixtures';

import { useReplayPlayback } from './useReplayPlayback';

const GAME_ID = -1001;

function setup(opened: OpenedReplay | undefined) {
  const store = configureStore({
    reducer: { games: games.gamesReducer },
    preloadedState: { games: { games: {}, pings: {} } as GamesState },
  });
  const webClient = createMockWebClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <WebClientContext.Provider value={webClient as WebClient}>{children}</WebClientContext.Provider>
      </Provider>
    );
  }
  const hook = renderHook(() => useReplayPlayback(opened), { wrapper: Wrapper });
  return { ...hook, store, webClient };
}

function opened(): OpenedReplay {
  return {
    key: '1',
    gameId: GAME_ID,
    title: 'fixture.cor',
    replay: buildReplay([sayContainer(0, 'first'), sayContainer(1, 'second'), sayContainer(3, 'third')]),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe('useReplayPlayback', () => {
  it('loads a replay game for the opened replay and unloads it on unmount', () => {
    const { store, unmount, result } = setup(opened());

    expect(store.getState().games.games[GAME_ID]).toMatchObject({ replay: true, localPlayerId: -1 });
    expect(result.current.state).toMatchObject({ currentTime: 0, maxTime: 3000, totalEvents: 3 });

    unmount();
    expect(store.getState().games.games[GAME_ID]).toBeUndefined();
  });

  it('feeds recorded containers to the replay game through the web client while playing', () => {
    const { result, webClient } = setup(opened());

    act(() => result.current.togglePlay());
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    const feed = vi.mocked(webClient.replayGameEventContainer);
    expect(feed).toHaveBeenCalledTimes(2);
    expect(feed.mock.calls.map(([container, gameId]) => [container.secondsElapsed, gameId])).toEqual([
      [0, GAME_ID],
      [1, GAME_ID],
    ]);
    expect(result.current.state.playing).toBe(true);
  });

  it('seeking backwards reloads the game before replaying up to the target', () => {
    const { result, webClient, store } = setup(opened());
    act(() => result.current.seek(3000));
    act(() => {
      store.dispatch(games.Actions.gameSay({ gameId: GAME_ID, playerId: 0, message: 'stale', timeReceived: 0 }));
    });

    act(() => result.current.seek(500));

    // The reload wiped the extra chat line; only the replay-started notice remains.
    expect(store.getState().games.games[GAME_ID].messages).toHaveLength(1);
    expect(vi.mocked(webClient.replayGameEventContainer).mock.calls.at(-1)?.[0].secondsElapsed).toBe(0);
  });

  it('fast forward speeds the clock up by the configured factor', () => {
    const { result } = setup(opened());

    act(() => result.current.toggleFastForward());

    expect(result.current.fastForward).toBe(true);
    expect(result.current.state.timeScaleFactor).toBe(10);
  });

  it('is idle without an opened replay', () => {
    const { result, store } = setup(undefined);

    expect(result.current.state).toMatchObject({ maxTime: 0, playing: false });
    expect(result.current.timeline).toEqual([]);
    expect(Object.keys(store.getState().games.games)).toEqual([]);
  });
});
