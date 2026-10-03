import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { create, toBinary } from '@bufbuild/protobuf';

import {
  GameReplaySchema,
  Response_ResponseCode,
  ServerInfo_ReplayMatchSchema,
  ServerInfo_ReplaySchema,
  ServerInfo_User_UserLevelFlag,
} from '@cockatrice/sockatrice/generated';
import type { WebClient } from '@cockatrice/sockatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { server } from '@cockatrice/datatrice';
import { ReplayFileDTO, ReplayNameTakenError, getOpenedReplays } from '@app/services';
import { RouteEnum } from '@app/types';

import {
  connectedState,
  createMockWebClient,
  disconnectedState,
  makeStoreState,
  makeUser,
  renderWithProviders,
} from '../../__test-utils__';
import { buildReplay, sayContainer } from '../../services/replay/__mocks__/fixtures';
import Replays from './Replays';

vi.mock('../../hooks/useSettings');

const REGISTERED = ServerInfo_User_UserLevelFlag.IsUser | ServerInfo_User_UserLevelFlag.IsRegistered;

function match(gameId: number, overrides: Partial<{ doNotHide: boolean; replayIds: number[] }> = {}) {
  return create(ServerInfo_ReplayMatchSchema, {
    gameId,
    gameName: `Game ${gameId}`,
    roomName: 'Main',
    playerNames: ['alice', 'bob'],
    timeStarted: 1_700_000_000,
    length: 300,
    doNotHide: overrides.doNotHide ?? false,
    replayList: (overrides.replayIds ?? [gameId * 10]).map((replayId) =>
      create(ServerInfo_ReplaySchema, { replayId, replayName: `Replay ${replayId}`, duration: 120 })),
  });
}

function stateWith({ registered = true, connected = true, matches = [match(7)] } = {}) {
  const base = connected ? connectedState : disconnectedState;
  return makeStoreState({
    ...base,
    server: {
      ...(base.server as any),
      user: connected ? makeUser({ userLevel: registered ? REGISTERED : ServerInfo_User_UserLevelFlag.IsUser }) : null,
      replays: Object.fromEntries(matches.map((m) => [m.gameId, m])),
    },
  });
}

function renderReplays(preloadedState = stateWith(), webClient: WebClient = createMockWebClient()) {
  const view = renderWithProviders(
    <Routes>
      <Route path={RouteEnum.REPLAYS} element={<Replays />} />
      <Route path={RouteEnum.REPLAY} element={<div data-testid="replay-view" />} />
    </Routes>,
    { route: RouteEnum.REPLAYS, preloadedState, webClient },
  );
  return { ...view, webClient };
}

function serverPane() {
  return within(screen.getByRole('region', { name: 'Replays.server.title' }));
}

/** The callback argument at `index` of the last call to a mock. */
function lastCallArg<T>(mock: unknown, index: number): T {
  return vi.mocked(mock as (...args: unknown[]) => unknown).mock.lastCall![index] as T;
}

beforeEach(() => {
  vi.spyOn(ReplayFileDTO, 'listFolder').mockResolvedValue([]);
  vi.spyOn(ReplayFileDTO, 'getAll').mockResolvedValue([]);
});

describe('Server replay storage', () => {
  it('asks to connect while disconnected and keeps every action disabled', () => {
    const { webClient } = renderReplays(stateWith({ connected: false }));

    expect(serverPane().getByText('Replays.server.disconnected')).toBeInTheDocument();
    expect(serverPane().getByRole('button', { name: 'Replays.action.submitCode' })).toBeDisabled();
    expect(webClient.request.session.replayList).not.toHaveBeenCalled();
  });

  it('is unavailable to unregistered users, as on desktop', () => {
    const { webClient } = renderReplays(stateWith({ registered: false }));

    expect(serverPane().getByText('Replays.server.unregistered')).toBeInTheDocument();
    expect(serverPane().getByRole('button', { name: 'Replays.action.submitCode' })).toBeDisabled();
    expect(webClient.request.session.replayList).not.toHaveBeenCalled();
  });

  it('requests the catalogue on open and lists matches with their replays', () => {
    const { webClient } = renderReplays(stateWith({ matches: [match(7, { doNotHide: true, replayIds: [70, 71] }), match(9)] }));

    expect(webClient.request.session.replayList).toHaveBeenCalledTimes(1);
    const row = serverPane().getByTestId('replay-match-7');
    expect(row).toHaveTextContent('Game 7');
    expect(row).toHaveTextContent('alice, bob');
    expect(serverPane().getByTestId('replay-locked-7')).toBeInTheDocument();
    expect(serverPane().queryByTestId('replay-locked-9')).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Replays.server.expand' }));
    expect(serverPane().getByTestId('replay-70')).toHaveTextContent('Replay 70');
    expect(serverPane().getByTestId('replay-71')).toBeInTheDocument();
  });

  it('shows loading until the list arrives, then an empty state for an account without replays', () => {
    const { store } = renderReplays(stateWith({ matches: [] }));
    expect(serverPane().getByText('Replays.server.loading')).toBeInTheDocument();

    act(() => {
      store.dispatch(server.Actions.replayList({ matchList: [] }));
    });
    expect(serverPane().getByText('Replays.server.empty')).toBeInTheDocument();
  });

  it('adds a replay announced by Event_ReplayAdded', () => {
    const { store } = renderReplays(stateWith({ matches: [] }));

    act(() => {
      store.dispatch(server.Actions.replayAdded({ matchInfo: match(12) }));
    });
    expect(serverPane().getByTestId('replay-match-12')).toBeInTheDocument();
  });

  it('match actions stay disabled until a match is selected', () => {
    renderReplays();
    const deleteButton = serverPane().getByRole('button', { name: 'Replays.action.delete' });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    expect(deleteButton).toBeEnabled();
    // Watching needs a replay, not a match.
    expect(serverPane().getByRole('button', { name: 'Replays.action.watch' })).toBeDisabled();
  });

  it('toggles the expiration lock to the opposite of the current state', () => {
    const { webClient } = renderReplays(stateWith({ matches: [match(7, { doNotHide: true })] }));

    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.toggleKeep' }));

    expect(webClient.request.session.replayModifyMatch).toHaveBeenCalledWith(7, false, expect.any(Function));
  });

  it('deletes a match only after the desktop confirmation', () => {
    const { webClient } = renderReplays();

    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.delete' }));
    expect(webClient.request.session.replayDeleteMatch).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Replays.server.deleteMessage');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replays.action.delete' }));

    expect(webClient.request.session.replayDeleteMatch).toHaveBeenCalledWith(7, expect.any(Function));
  });

  it('reports a rejected delete', () => {
    const { webClient } = renderReplays();
    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.delete' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Replays.action.delete' }));

    act(() => {
      lastCallArg<(code: number) => void>(webClient.request.session.replayDeleteMatch, 1)(Response_ResponseCode.RespContextError);
    });

    expect(screen.getByRole('dialog')).toHaveTextContent('Replays.server.deleteFailed');
  });

  it('explains a delete the server never answered with the transport reason', () => {
    const { webClient } = renderReplays();
    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.delete' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Replays.action.delete' }));

    act(() => {
      lastCallArg<(code: number, failure?: WebsocketTypes.CommandFailure) => void>(
        webClient.request.session.replayDeleteMatch, 1,
      )(Response_ResponseCode.RespNotConnected, WebsocketTypes.CommandFailure.Timeout);
    });

    expect(screen.getByRole('dialog')).toHaveTextContent('CommandFailure.timeout');
  });

  it('stops loading and explains a replay list the server never answered', () => {
    const { store } = renderReplays(stateWith({ matches: [] }));
    expect(serverPane().getByText('Replays.server.loading')).toBeInTheDocument();

    act(() => {
      store.dispatch(server.Actions.replayListFailed({
        responseCode: Response_ResponseCode.RespNotConnected,
        failure: WebsocketTypes.CommandFailure.Disconnected,
      }));
    });

    expect(screen.getByRole('dialog')).toHaveTextContent('CommandFailure.disconnected');
    // The open notice hides the pane from the accessibility tree, so query the DOM directly.
    expect(screen.queryByText('Replays.server.loading')).not.toBeInTheDocument();
  });

  it('shows a share code with a copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { webClient } = renderReplays();

    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.getCode' }));
    expect(webClient.request.session.replayGetCode).toHaveBeenCalledWith(7, expect.any(Function), expect.any(Function));

    act(() => {
      lastCallArg<(code: string) => void>(webClient.request.session.replayGetCode, 1)('7-abcdef');
    });
    expect(await screen.findByTestId('replay-share-code')).toHaveTextContent('7-abcdef');

    fireEvent.click(screen.getByRole('button', { name: 'Replays.share.copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('7-abcdef'));
  });

  it('explains a refused share code request with desktop\'s wording', () => {
    const { webClient } = renderReplays();
    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.getCode' }));

    act(() => {
      lastCallArg<(code: number) => void>(webClient.request.session.replayGetCode, 2)(Response_ResponseCode.RespFunctionNotAllowed);
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Replays.share.getFailedTitle');
    expect(dialog).toHaveTextContent('Replays.share.notPermitted');
  });

  it('looks up a share code and reports each outcome', () => {
    const { webClient } = renderReplays();

    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.submitCode' }));
    fireEvent.change(screen.getByLabelText('Replays.share.codeLabel'), { target: { value: '  7-abcdef ' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));
    expect(webClient.request.session.replaySubmitCode).toHaveBeenCalledWith('7-abcdef', expect.any(Function), expect.any(Function));

    act(() => {
      lastCallArg<(code: number) => void>(webClient.request.session.replaySubmitCode, 2)(Response_ResponseCode.RespNameNotFound);
    });
    expect(screen.getByRole('dialog')).toHaveTextContent('Replays.share.notFound');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));

    act(() => {
      lastCallArg<() => void>(webClient.request.session.replaySubmitCode, 1)();
    });
    expect(screen.getByRole('dialog')).toHaveTextContent('Replays.share.found');
  });

  it('is operable from the keyboard: arrows select, → and ← fold, Enter watches', () => {
    const { webClient } = renderReplays(stateWith({ matches: [match(7, { replayIds: [70, 71] }), match(9)] }));
    const grid = serverPane().getByRole('treegrid');
    const first = serverPane().getByTestId('replay-match-7');

    // One tab stop: the first row until something is selected.
    expect(first).toHaveAttribute('tabindex', '0');
    expect(serverPane().getByTestId('replay-match-9')).toHaveAttribute('tabindex', '-1');
    expect(within(grid).queryAllByRole('button').every((button) => button.tabIndex === -1)).toBe(true);

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(serverPane().getByTestId('replay-match-9')).toHaveAttribute('aria-selected', 'true');
    expect(serverPane().getByTestId('replay-match-9')).toHaveFocus();

    fireEvent.keyDown(serverPane().getByTestId('replay-match-9'), { key: 'ArrowUp' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(first).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const replay = serverPane().getByTestId('replay-70');
    expect(replay).toHaveFocus();
    expect(replay).toHaveAttribute('aria-selected', 'true');
    expect(replay).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(replay, { key: 'Enter' });
    expect(webClient.request.session.replayDownload).toHaveBeenCalledWith(70, expect.any(Function), expect.any(Function));

    fireEvent.keyDown(replay, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(serverPane().queryByTestId('replay-70')).not.toBeInTheDocument();

    fireEvent.keyDown(first, { key: 'Enter' });
    expect(first).toHaveAttribute('aria-expanded', 'true');
  });

  it('downloads a replay and opens it in the replay view when watched', () => {
    const { webClient } = renderReplays();

    fireEvent.click(within(serverPane().getByTestId('replay-match-7')).getByRole('button', { name: 'Replays.server.expand' }));
    fireEvent.doubleClick(serverPane().getByTestId('replay-70'));
    expect(webClient.request.session.replayDownload).toHaveBeenCalledWith(70, expect.any(Function), expect.any(Function));

    const bytes = toBinary(GameReplaySchema, buildReplay([sayContainer(0)]));
    act(() => {
      lastCallArg<(data: Uint8Array) => void>(webClient.request.session.replayDownload, 1)(bytes);
    });

    expect(screen.getByTestId('replay-view')).toBeInTheDocument();
    expect(getOpenedReplays().at(-1)?.title).toBe('Replays.server.matchReplayTitle');
  });

  it('saves every replay of a match as a .cor download', () => {
    const createObjectURL = vi.fn(() => 'blob:replay');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function record(this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    const { webClient } = renderReplays(stateWith({ matches: [match(7, { replayIds: [70, 71] })] }));

    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.download' }));

    const calls = vi.mocked(webClient.request.session.replayDownload).mock.calls;
    expect(calls.map(([replayId]) => replayId)).toEqual([70, 71]);
    act(() => {
      calls.forEach(([, onDownloaded]) => onDownloaded?.(new Uint8Array([1])));
    });
    expect(clicks).toEqual(['replay_70.cor', 'replay_71.cor']);
  });

  it('saves a selected replay straight into the current local folder', async () => {
    const addReplay = vi.spyOn(ReplayFileDTO, 'addReplay').mockResolvedValue(5);
    const addFolder = vi.spyOn(ReplayFileDTO, 'addFolder');
    const { webClient } = renderReplays();

    fireEvent.click(within(serverPane().getByTestId('replay-match-7')).getByRole('button', { name: 'Replays.server.expand' }));
    fireEvent.click(serverPane().getByTestId('replay-70'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.saveToLibrary' }));
    await waitFor(() => expect(webClient.request.session.replayDownload).toHaveBeenCalled());
    act(() => {
      lastCallArg<(data: Uint8Array) => void>(webClient.request.session.replayDownload, 1)(new Uint8Array([1, 2]));
    });

    await waitFor(() => expect(addReplay).toHaveBeenCalledWith(0, 'replay_70.cor', new Uint8Array([1, 2])));
    expect(addFolder).not.toHaveBeenCalled();
  });

  it('saves a match into a new <gameId>_<gameName> folder, as desktop does', async () => {
    const addFolder = vi.spyOn(ReplayFileDTO, 'addFolder').mockResolvedValue(12);
    const addReplay = vi.spyOn(ReplayFileDTO, 'addReplay').mockResolvedValue(5);
    const { webClient } = renderReplays(stateWith({ matches: [match(7, { replayIds: [70, 71] })] }));

    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.saveToLibrary' }));

    await waitFor(() => expect(webClient.request.session.replayDownload).toHaveBeenCalledTimes(2));
    expect(addFolder).toHaveBeenCalledWith(0, '7_Game 7');
    for (const [, onDownloaded] of vi.mocked(webClient.request.session.replayDownload).mock.calls) {
      act(() => onDownloaded!(new Uint8Array([1])));
    }
    await waitFor(() => expect(addReplay).toHaveBeenCalledTimes(2));
    expect(addReplay.mock.calls.map(([parentId, name]) => [parentId, name])).toEqual([[12, 'replay_70.cor'], [12, 'replay_71.cor']]);
  });

  it('reuses the match folder when it already exists', async () => {
    vi.spyOn(ReplayFileDTO, 'addFolder').mockRejectedValue(new ReplayNameTakenError('7_Game 7'));
    vi.mocked(ReplayFileDTO.listFolder).mockResolvedValue([
      Object.assign(new ReplayFileDTO(), { id: 33, name: '7_Game 7', kind: 'folder', parentId: 0 }),
    ]);
    const addReplay = vi.spyOn(ReplayFileDTO, 'addReplay').mockResolvedValue(5);
    const { webClient } = renderReplays();

    fireEvent.click(serverPane().getByTestId('replay-match-7'));
    fireEvent.click(serverPane().getByRole('button', { name: 'Replays.action.saveToLibrary' }));
    await waitFor(() => expect(webClient.request.session.replayDownload).toHaveBeenCalled());
    act(() => {
      lastCallArg<(data: Uint8Array) => void>(webClient.request.session.replayDownload, 1)(new Uint8Array([1]));
    });

    await waitFor(() => expect(addReplay).toHaveBeenCalledWith(33, 'replay_70.cor', new Uint8Array([1])));
  });
});
