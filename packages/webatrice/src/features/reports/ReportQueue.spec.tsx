import { act, fireEvent, screen } from '@testing-library/react';
import { Routes, Route, useParams } from 'react-router-dom';
import { create, toBinary } from '@bufbuild/protobuf';
import { rooms, server } from '@cockatrice/datatrice';
import {
  GameReplaySchema,
  Response_ReportStatsSchema,
  Response_ReportUserInfoSchema,
  Response_ResponseCode,
  ServerInfo_RoomSchema,
} from '@cockatrice/sockatrice/generated';
import type { Mock } from 'vitest';

import { createMockWebClient, renderWithProviders } from '../../__test-utils__';
import { getOpenedReplay } from '../../services';
import { buildReplay, sayContainer } from '../../services/replay/__mocks__/fixtures';
import { RouteEnum } from '../../types';
import { makeReport, reportsRootState, SERVER_30 } from './__mocks__/reportState';
import ReportQueue from './ReportQueue';

const OPEN = makeReport({ reportId: 1, reporterName: 'alice', reportedUserName: 'mallory', status: 'open', category: 'spam' });
const ASSIGNED = makeReport({
  reportId: 2, reporterName: 'bob', reportedUserName: 'eve', status: 'assigned', gameId: 30, roomId: 4, replayId: 9,
});

function renderQueue(options: { moderator?: boolean; version?: string } = {}) {
  const webClient = createMockWebClient();
  const utils = renderWithProviders(
    <Routes>
      <Route path={RouteEnum.REPORT_QUEUE} element={<ReportQueue />} />
      <Route path={RouteEnum.SERVER} element={<div>lobby</div>} />
      <Route path={RouteEnum.GAME} element={<div>game page</div>} />
      <Route path={RouteEnum.REPLAY} element={<ReplayViewProbe />} />
    </Routes>,
    {
      preloadedState: reportsRootState({ moderator: options.moderator ?? true, version: options.version }),
      webClient,
      route: RouteEnum.REPORT_QUEUE,
    },
  );
  const moderator = webClient.request.moderator as unknown as Record<string, Mock>;
  const session = webClient.request.session as unknown as Record<string, Mock>;
  const roomsRequest = webClient.request.rooms as unknown as Record<string, Mock>;
  const load = (reports = [OPEN, ASSIGNED]) => act(() => {
    utils.store.dispatch(server.Actions.reportList({ reports, totalCount: reports.length }));
  });
  return { ...utils, moderator, session, roomsRequest, load };
}

function ReplayViewProbe() {
  const { replayKey } = useParams();
  return <div data-testid="replay-view">{getOpenedReplay(replayKey)?.title}</div>;
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('ReportQueue gating', () => {
  it('sends non-moderators back to the lobby without sending a moderator command', () => {
    const { moderator } = renderQueue({ moderator: false });
    expect(screen.getByText('lobby')).toBeTruthy();
    expect(moderator.reportList).not.toHaveBeenCalled();
    expect(moderator.reportStats).not.toHaveBeenCalled();
  });

  it('is hidden on a 3.0 server and queries nothing', () => {
    const { moderator } = renderQueue({ version: SERVER_30 });
    expect(screen.getByText('lobby')).toBeTruthy();
    expect(moderator.reportList).not.toHaveBeenCalled();
  });
});

describe('ReportQueue', () => {
  it('loads the unresolved queue and the stats on open, and re-queries when the switch flips', () => {
    const { moderator } = renderQueue();
    expect(moderator.reportList).toHaveBeenCalledWith(true, undefined, undefined, expect.any(Function));
    expect(moderator.reportStats).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Reports.queue.unresolvedOnly'));
    expect(moderator.reportList).toHaveBeenLastCalledWith(false, undefined, undefined, expect.any(Function));
  });

  it('filters by search text and status locally', () => {
    const { load } = renderQueue();
    load();
    expect(screen.getAllByTestId(/^report-row-/)).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Reports.queue.searchPlaceholder'), { target: { value: 'MALL' } });
    expect(screen.getAllByTestId(/^report-row-/).map((r) => r.dataset.testid)).toEqual(['report-row-1']);
    fireEvent.change(screen.getByLabelText('Reports.queue.searchPlaceholder'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Reports.column.status'), { target: { value: 'assigned' } });
    expect(screen.getAllByTestId(/^report-row-/).map((r) => r.dataset.testid)).toEqual(['report-row-2']);
  });

  it('enables actions by status like desktop updateActionStates', () => {
    const { load } = renderQueue();
    load();
    expect(button('Reports.queue.assign').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('report-row-1'));
    expect(button('Reports.queue.assign').disabled).toBe(false);
    expect(button('Reports.queue.resolve').disabled).toBe(false);
    expect(button('Reports.queue.viewReplay').disabled).toBe(true);
    expect(button('Reports.queue.joinGame').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('report-row-2'));
    expect(button('Reports.queue.assign').disabled).toBe(true);
    expect(button('Reports.queue.dismiss').disabled).toBe(false);
    expect(button('Reports.queue.viewReplay').disabled).toBe(false);
    expect(button('Reports.queue.joinGame').disabled).toBe(false);
  });

  it('assigns to me, then refreshes; a failure says so without refreshing', () => {
    const { moderator, load } = renderQueue();
    load();
    fireEvent.click(screen.getByTestId('report-row-1'));
    fireEvent.click(button('Reports.queue.assign'));
    expect(moderator.reportAssign).toHaveBeenCalledWith(1, expect.any(Function), expect.any(Function));
    expect(screen.getByTestId('report-queue-status').textContent).toBe('Reports.queue.assigning');
    expect(button('Reports.queue.resolve').disabled).toBe(true);

    act(() => moderator.reportAssign.mock.calls[0][2](20));
    expect(screen.getByTestId('report-queue-status').textContent).toBe('Reports.queue.assignFailed');
    expect(moderator.reportList).toHaveBeenCalledTimes(1);

    fireEvent.click(button('Reports.queue.assign'));
    act(() => moderator.reportAssign.mock.calls[1][1]());
    expect(screen.getByTestId('report-queue-status').textContent).toBe('Reports.queue.assignedDone');
    expect(moderator.reportList).toHaveBeenCalledTimes(2);
  });

  it('resolves without a note, and dismisses with the note from the prompt', () => {
    const { moderator, load } = renderQueue();
    load();
    fireEvent.click(screen.getByTestId('report-row-2'));
    fireEvent.click(button('Reports.queue.resolve'));
    expect(moderator.reportResolve).toHaveBeenCalledWith(2, undefined, false, expect.any(Function), expect.any(Function));
    act(() => moderator.reportResolve.mock.calls[0][4](20));
    expect(screen.getByTestId('report-queue-status').textContent).toBe('Reports.queue.actionFailed');

    fireEvent.click(button('Reports.queue.dismiss'));
    fireEvent.change(screen.getByLabelText('Reports.queue.dismissNoteLabel'), { target: { value: ' duplicate ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reports.queue.ok' }));
    expect(moderator.reportResolve).toHaveBeenLastCalledWith(2, 'duplicate', true, expect.any(Function), expect.any(Function));
  });

  it('requests and shows the reported user context', () => {
    const { moderator, load, store } = renderQueue();
    load();
    fireEvent.click(screen.getByTestId('report-row-1'));
    expect(moderator.reportUserInfo).toHaveBeenCalledWith('mallory');
    act(() => {
      store.dispatch(server.Actions.userInfoReport({
        info: create(Response_ReportUserInfoSchema, { userName: 'mallory', totalBans: 3, adminNotes: 'watch' }),
      }));
    });
    const panel = screen.getByTestId('report-user-context');
    expect(panel.textContent).toContain('watch');
    expect(panel.textContent).toContain('Reports.userContext.noRecent');
  });

  it('says the reported user context failed when the shared lookup fails', () => {
    const { load, store } = renderQueue();
    load();
    fireEvent.click(screen.getByTestId('report-row-1'));
    act(() => {
      store.dispatch(server.Actions.moderatorCommandFailed({
        command: 'reportUserInfo', responseCode: Response_ResponseCode.RespInternalError, target: 'someone else',
      }));
    });
    expect(screen.getByTestId('report-user-context').textContent).not.toContain('Reports.userContext.loadFailed');
    act(() => {
      store.dispatch(server.Actions.moderatorCommandFailed({
        command: 'reportUserInfo', responseCode: Response_ResponseCode.RespInternalError, target: 'mallory',
      }));
    });
    expect(screen.getByTestId('report-user-context').textContent).toContain('Reports.userContext.loadFailed');
  });

  it('opens the replay in the replay view once the matching download arrives', () => {
    const { moderator, load, store } = renderQueue();
    load();
    fireEvent.click(screen.getByTestId('report-row-2'));
    fireEvent.click(button('Reports.queue.viewReplay'));
    expect(moderator.replayDownloadByGameId).toHaveBeenCalledWith(30, expect.any(Function));
    expect(screen.getByTestId('report-queue-status').textContent).toBe('Reports.queue.loadingReplay');

    // A replay for another game (a stale response) is ignored.
    const replayData = toBinary(GameReplaySchema, buildReplay([sayContainer(0)], 30));
    act(() => {
      store.dispatch(server.Actions.reportReplayDownloaded({ gameId: 31, replayId: 8, replayData }));
    });
    expect(screen.queryByTestId('replay-view')).toBeNull();

    act(() => {
      store.dispatch(server.Actions.reportReplayDownloaded({ gameId: 30, replayId: 9, replayData }));
    });
    expect(screen.getByTestId('replay-view').textContent).toBe('Reports.queue.replayTitle');
  });

  it('says the replay could not be parsed and stays on the queue', () => {
    const { load, store } = renderQueue();
    load();
    fireEvent.click(screen.getByTestId('report-row-2'));
    fireEvent.click(button('Reports.queue.viewReplay'));
    act(() => {
      store.dispatch(server.Actions.reportReplayDownloaded({ gameId: 30, replayId: 9, replayData: new Uint8Array([1, 2, 3]) }));
    });
    expect(screen.queryByTestId('replay-view')).toBeNull();
    expect(screen.getByTestId('report-queue-status').textContent).toBe('Reports.queue.replayParseFailed');
  });

  it('says there is no replay when the download fails', () => {
    const { moderator, load } = renderQueue();
    load();
    fireEvent.click(screen.getByTestId('report-row-2'));
    fireEvent.click(button('Reports.queue.viewReplay'));
    act(() => moderator.replayDownloadByGameId.mock.calls[0][1](8));
    expect(screen.getByTestId('report-queue-status').textContent).toBe('Reports.queue.noReplay');
  });

  it('joins the room first, then spectates the reported game', () => {
    const { session, roomsRequest, load, store } = renderQueue();
    load();
    fireEvent.click(screen.getByTestId('report-row-2'));
    fireEvent.click(button('Reports.queue.joinGame'));
    expect(session.joinRoom).toHaveBeenCalledWith(4);
    expect(roomsRequest.joinGame).not.toHaveBeenCalled();
    act(() => {
      store.dispatch(rooms.Actions.joinRoom({ roomInfo: create(ServerInfo_RoomSchema, { roomId: 4, name: 'Main' }) }));
    });
    expect(roomsRequest.joinGame).toHaveBeenCalledWith(4, {
      gameId: 30, password: '', spectator: true, overrideRestrictions: false, joinAsJudge: false,
    });
  });

  it('renders the statistics once they land', () => {
    const { store } = renderQueue();
    act(() => {
      store.dispatch(server.Actions.reportStats({
        stats: create(Response_ReportStatsSchema, { totalReports: 5, reportsThisWeek: 3, reportsLastWeek: 2 }),
      }));
    });
    expect(screen.getByTestId('report-stats').textContent).toContain('Reports.stats.total');
    expect(screen.getByTestId('report-stats-detail').textContent).toContain('Reports.stats.topCategories');
  });

  it('comments as staff with the reply placeholder', () => {
    const { session, load } = renderQueue();
    load();
    fireEvent.click(screen.getByTestId('report-row-2'));
    const input = screen.getByLabelText('Reports.thread.addComment') as HTMLInputElement;
    expect(input.placeholder).toBe('Reports.thread.replyPlaceholder');
    fireEvent.change(input, { target: { value: 'on it' } });
    fireEvent.click(screen.getByRole('button', { name: /Reports.thread.send/ }));
    expect(session.reportAddComment).toHaveBeenCalledWith(2, 'on it', expect.any(Function), expect.any(Function));
  });
});
