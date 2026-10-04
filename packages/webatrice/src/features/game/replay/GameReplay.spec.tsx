import { combineReducers } from '@reduxjs/toolkit';
import { act, fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { attachResponseHandlers, createStore } from '@cockatrice/datatrice';
import { ZoneName } from '@cockatrice/sockatrice';
import type { WebClient } from '@cockatrice/sockatrice';
import {
  makeCard,
  makeGameEntry,
  makeGameInfo,
  makePlayerEntry,
  makePlayerProperties,
  makeZoneEntry,
} from '@cockatrice/datatrice/testing';
import { closeReplay, getOpenedReplay, getOpenedReplays, openReplay } from '@app/services';
import { rootReducerMap, type RootState } from '@app/store';
import { RouteEnum } from '@app/types';

import { createMockWebClient, connectedState, makeStoreState, makeUser, renderWithProviders } from '../../../__test-utils__';
import { buildReplay, sayContainer } from '../../../services/replay/__mocks__/fixtures';
import { GameBoard } from '../Game';
import { GameReadOnlyProvider } from '../components/ui/GameReadOnlyContext';
import GameReplay from './GameReplay';

// Block the Dexie-backed settings store from settling after mount.
vi.mock('../../../hooks/useSettings');

function renderReplayRoute(replayKey: string, webClient: WebClient = createMockWebClient(), store = makeStore()) {
  return renderWithProviders(
    <Routes>
      <Route path={RouteEnum.REPLAY} element={<GameReplay />} />
      <Route path={RouteEnum.REPLAYS} element={<div data-testid="replays-page" />} />
      <Route path={RouteEnum.SERVER} element={<div data-testid="server-page" />} />
    </Routes>,
    {
      route: `/replay/${replayKey}`,
      store,
      webClient,
      gameId: undefined,
    },
  );
}

function makeStore() {
  return createStore<RootState>({
    reducer: combineReducers(rootReducerMap),
    preloadedState: makeStoreState({ ...connectedState, games: { games: {}, pings: {} } }),
  });
}

/**
 * Opens a replay with a mock client whose replay-game calls reach the store the
 * shipped way: WebClient → Datatrice's GameResponseImpl.
 */
function openTestReplay(replay = buildReplay([sayContainer(0)])) {
  const store = makeStore();
  const webClient = createMockWebClient();
  const response = attachResponseHandlers(store);
  vi.mocked(webClient.loadReplayGame).mockImplementation((gameId, gameInfo) => response.game.replayGameLoaded?.(gameId, gameInfo));
  vi.mocked(webClient.unloadReplayGame).mockImplementation((gameId) => response.game.replayGameUnloaded?.(gameId));
  const key = openReplay(replay, 'fixture.cor', webClient);
  return { key, store, webClient, render: () => renderReplayRoute(key, webClient, store) };
}

afterEach(() => {
  getOpenedReplays().forEach(({ key }) => closeReplay(key));
});

/** Every request facade method of the mock client, flattened. */
function allRequestSpies(webClient: WebClient) {
  return Object.values(webClient.request).flatMap((scope) => Object.values(scope as unknown as Record<string, ReturnType<typeof vi.fn>>));
}

describe('GameReplay route', () => {
  it('explains that a replay is gone after a reload and links back to the replays tab', () => {
    renderReplayRoute('does-not-exist');

    expect(screen.getByTestId('replay-missing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GameReplay.backToReplays' })).toHaveAttribute('href', RouteEnum.REPLAYS);
  });

  it('plays an opened replay on the read-only board with the replay dock', () => {
    const { render, store } = openTestReplay(buildReplay([sayContainer(0), sayContainer(2)]));
    render();

    expect(screen.getByTestId('replay-controls')).toBeInTheDocument();
    expect(screen.getByTestId('replay-time')).toHaveTextContent('0:00 / 0:02');
    expect(screen.getByTestId('game-container')).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByTestId('spectating-tag')).toHaveTextContent('GameReplay.sidebar.tag');
    expect(screen.queryByTestId('game-log-timer')).not.toBeInTheDocument();
    // Desktop's replay tab has no say box.
    expect(screen.getByLabelText('ChatLog.inputLabel').closest('form')).not.toBeVisible();
    expect(screen.queryByRole('button', { name: 'GameInvite.copyLink' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'GameInvite.inviteToGame' })).not.toBeInTheDocument();

    const replayGames = Object.values(store.getState().games.games).filter((g) => g.replay);
    expect(replayGames).toHaveLength(1);
  });

  it('closes the replay from the sidebar instead of leaving a game', () => {
    const { key, render, store, webClient } = openTestReplay();
    render();

    fireEvent.click(screen.getByRole('button', { name: /GameReplay\.sidebar\.close/ }));

    expect(screen.getByTestId('replays-page')).toBeInTheDocument();
    expect(webClient.request.game.leaveGame).not.toHaveBeenCalled();
    expect(getOpenedReplay(key)).toBeUndefined();
    expect(Object.values(store.getState().games.games).filter((g) => g.replay)).toHaveLength(0);
  });

  it('keeps the replay open and its game loaded when the view is left without closing it', () => {
    const { key, render, store } = openTestReplay(buildReplay([sayContainer(0), sayContainer(2)]));
    const { unmount } = render();
    act(() => getOpenedReplay(key)!.engine.seek(2000));
    unmount();

    expect(getOpenedReplay(key)).toBeDefined();
    expect(Object.values(store.getState().games.games).filter((g) => g.replay)).toHaveLength(1);

    render();
    expect(screen.getByTestId('replay-time')).toHaveTextContent('0:02 / 0:02');
  });
});

describe('GameBoard in read-only mode', () => {
  const REPLAY_GAME_ID = -1001;

  // A seated local player (unlike a real replay) so the board would act on input
  // if anything let it through.
  function boardState() {
    const players = Object.fromEntries([0, 1].map((pid) => [pid, makePlayerEntry({
      properties: makePlayerProperties({ playerId: pid, userInfo: makeUser({ name: `P${pid}` }) }),
      zones: {
        [ZoneName.TABLE]: makeZoneEntry({ name: ZoneName.TABLE, cards: [makeCard({ id: 10 + pid, name: 'Island' })], cardCount: 1 }),
        [ZoneName.HAND]: makeZoneEntry({ name: ZoneName.HAND, cards: [makeCard({ id: 20 + pid, name: 'Forest' })], cardCount: 1 }),
        [ZoneName.DECK]: makeZoneEntry({ name: ZoneName.DECK, cardCount: 30 }),
        [ZoneName.GRAVE]: makeZoneEntry({ name: ZoneName.GRAVE }),
        [ZoneName.EXILE]: makeZoneEntry({ name: ZoneName.EXILE }),
      },
    })]));
    return makeStoreState({
      ...connectedState,
      games: {
        games: {
          [REPLAY_GAME_ID]: makeGameEntry({
            localPlayerId: 0,
            hostId: 0,
            started: true,
            activePlayerId: 0,
            activePhase: 3,
            players,
            info: makeGameInfo({ spectatorsOmniscient: true }),
          }),
        },
      },
    });
  }

  function hammerBoard(readOnly: boolean) {
    const webClient = createMockWebClient();
    renderWithProviders(
      <GameReadOnlyProvider value={readOnly}>
        <GameBoard gameId={REPLAY_GAME_ID} />
      </GameReadOnlyProvider>,
      { preloadedState: boardState(), webClient, gameId: undefined },
    );
    // Mount-time fetches (the top bar's deck list) are not board input.
    vi.clearAllMocks();
    const board = screen.getByTestId('game-container').querySelector('.game__board')!;
    for (const element of [board, ...Array.from(board.querySelectorAll('*'))]) {
      fireEvent.pointerDown(element);
      fireEvent.mouseDown(element);
      fireEvent.click(element);
      fireEvent.doubleClick(element);
      fireEvent.contextMenu(element);
    }
    return allRequestSpies(webClient).filter((spy) => spy.mock.calls.length > 0);
  }

  it('lets no press, click or menu on the board reach a game command', () => {
    expect(hammerBoard(true)).toEqual([]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('lets no click on the phase track reach a game command', () => {
    const webClient = createMockWebClient();
    renderWithProviders(
      <GameReadOnlyProvider value>
        <GameBoard gameId={REPLAY_GAME_ID} />
      </GameReadOnlyProvider>,
      { preloadedState: boardState(), webClient, gameId: undefined },
    );
    vi.clearAllMocks();
    const phaseBar = screen.getByTestId('phase-bar');
    for (const element of [phaseBar, ...Array.from(phaseBar.querySelectorAll('*'))]) {
      fireEvent.click(element);
      fireEvent.doubleClick(element);
    }
    expect(allRequestSpies(webClient).filter((spy) => spy.mock.calls.length > 0)).toEqual([]);
  });

  it('the same input on a live board does reach the server (control)', () => {
    expect(hammerBoard(false).length).toBeGreaterThan(0);
  });

  it('marks the board read-only and drops the live-game confirmations', () => {
    renderWithProviders(
      <GameReadOnlyProvider value>
        <GameBoard gameId={REPLAY_GAME_ID} />
      </GameReadOnlyProvider>,
      { preloadedState: boardState(), gameId: undefined },
    );

    expect(screen.getByTestId('game-container')).toHaveAttribute('data-readonly', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
