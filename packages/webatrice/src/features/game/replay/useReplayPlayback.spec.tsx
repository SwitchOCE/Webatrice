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
  it('loads the replay game through the web client and unloads it on unmount', () => {
    const replay = opened();
    const { webClient, unmount, result } = setup(replay);

    expect(webClient.loadReplayGame).toHaveBeenCalledWith(GAME_ID, replay.replay.gameInfo);
    expect(result.current.state).toMatchObject({ currentTime: 0, maxTime: 3000, totalEvents: 3 });

    unmount();
    expect(webClient.unloadReplayGame).toHaveBeenCalledWith(GAME_ID);
  });

  it('never dispatches into the games slice itself', () => {
    const { store } = setup(opened());
    // Only Datatrice's GameResponseImpl creates the game, behind the web client.
    expect(store.getState().games.games).toEqual({});
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
    const { result, webClient } = setup(opened());
    act(() => result.current.seek(3000));
    expect(webClient.loadReplayGame).toHaveBeenCalledTimes(1);

    act(() => result.current.seek(500));

    expect(webClient.loadReplayGame).toHaveBeenCalledTimes(2);
    expect(vi.mocked(webClient.replayGameEventContainer).mock.calls.at(-1)?.[0].secondsElapsed).toBe(0);
  });

  it('fast forward speeds the clock up by the configured factor', () => {
    const { result } = setup(opened());

    act(() => result.current.toggleFastForward());

    expect(result.current.fastForward).toBe(true);
    expect(result.current.state.timeScaleFactor).toBe(10);
  });

  it('is idle without an opened replay', () => {
    const { result, webClient } = setup(undefined);

    expect(result.current.state).toMatchObject({ maxTime: 0, playing: false });
    expect(result.current.timeline).toEqual([]);
    expect(webClient.loadReplayGame).not.toHaveBeenCalled();
  });
});
