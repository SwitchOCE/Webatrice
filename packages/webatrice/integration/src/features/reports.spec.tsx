import { create } from '@bufbuild/protobuf';
import { act, fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Command_Login_ext,
  Command_ReportAddComment_ext,
  Command_ReportDetails_ext,
  Command_ReportMyList_ext,
  Command_Report_ext,
  Event_ServerIdentificationSchema,
  Event_ServerIdentification_ext,
  Response_LoginSchema,
  Response_Login_ext,
  Response_ReportDetailsSchema,
  Response_ReportDetails_ext,
  Response_ReportMyListSchema,
  Response_ReportMyList_ext,
  Response_ResponseCode,
  ServerInfo_ReportCommentSchema,
  ServerInfo_ReportSchema,
  ServerInfo_UserSchema,
  ServerInfo_User_UserLevelFlag,
} from '@cockatrice/sockatrice/generated';
import { PROTOCOL_VERSION } from '@cockatrice/sockatrice';
import { games } from '@cockatrice/datatrice';
import { Event_GameSaySchema, Event_GameSay_ext, Event_LeaveSchema, Event_Leave_ext } from '@cockatrice/sockatrice/generated';

import { ReportUserProvider, useReportUser } from '@app/dialogs';
import { MyReports } from '@app/features/reports';
import { RouteEnum } from '@app/types';
import ChatLog from '../../../src/features/game/components/ChatLog/ChatLog';
import { GameIdProvider } from '../../../src/features/game/components/ui/GameIdContext';
import { GameReadOnlyProvider } from '../../../src/features/game/components/ui/GameReadOnlyContext';

import { connectRaw, store } from '../helpers/setup';
import {
  buildGameEventMessage, buildResponse, buildResponseMessage, buildSessionEventMessage, deliverMessage,
} from '../helpers/protobuf-builders';
import { findLastSessionCommand } from '../helpers/command-capture';
import { renderFeatureScreen } from './helpers';
import { buildEventGameJoined, buildEventGameStateChanged } from './game/helpers';

// Log in to a server that reports itself as Cockatrice 3.1, so the report UI
// (gated on ServerCapability.REPORTS) is live.
function loginTo31(userName = 'alice') {
  connectRaw({ userName });
  deliverMessage(buildSessionEventMessage(Event_ServerIdentification_ext, create(Event_ServerIdentificationSchema, {
    serverName: 'TestServer',
    serverVersion: '3.1.0 (2026-08-21)',
    protocolVersion: PROTOCOL_VERSION,
  })));
  const login = findLastSessionCommand(Command_Login_ext);
  deliverMessage(buildResponseMessage(buildResponse({
    cmdId: login.cmdId,
    responseCode: Response_ResponseCode.RespOk,
    ext: Response_Login_ext,
    value: create(Response_LoginSchema, {
      userInfo: create(ServerInfo_UserSchema, { name: userName, userLevel: ServerInfo_User_UserLevelFlag.IsRegistered }),
    }),
  })));
}

function ok(cmdId: number) {
  act(() => deliverMessage(buildResponseMessage(buildResponse({ cmdId, responseCode: Response_ResponseCode.RespOk }))));
}

function ReportButton() {
  const { canReportUser, openReportUser } = useReportUser();
  return canReportUser('mallory')
    ? <button type="button" onClick={() => openReportUser({ userName: 'mallory', chatContext: '[10:00:00] mallory: rude' })}>report</button>
    : null;
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('Reports (integration)', () => {
  function renderGameChat(readOnly = false) {
    loginTo31();
    store.dispatch(games.Actions.gameJoined({ data: buildEventGameJoined({ gameId: 42, localPlayerId: 1, hostId: 1 }) }));
    store.dispatch(games.Actions.gameStateChanged({ gameId: 42, data: buildEventGameStateChanged([1, 2], 1) }));
    renderFeatureScreen(
      <ReportUserProvider>
        <GameReadOnlyProvider value={readOnly}>
          <GameIdProvider value={42}><ChatLog /></GameIdProvider>
        </GameReadOnlyProvider>
      </ReportUserProvider>,
    );
    act(() => deliverMessage(buildGameEventMessage({
      gameId: 42, playerId: 2, ext: Event_GameSay_ext,
      value: create(Event_GameSaySchema, { message: 'rude message' }),
    })));
  }

  it('reports from a game-chat author through the real menu and wire command, even after departure', async () => {
    renderGameChat();
    act(() => deliverMessage(buildGameEventMessage({
      gameId: 42, playerId: 2, ext: Event_Leave_ext, value: create(Event_LeaveSchema),
    })));
    fireEvent.contextMenu(screen.getByRole('link', { name: 'P2' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /ReportUserDialog.menuItem/ }));
    fireEvent.change(screen.getByLabelText('ReportUserDialog.descriptionGroup'), { target: { value: 'abusive game chat' } });
    fireEvent.click(screen.getByRole('button', { name: 'ReportUserDialog.submit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ReportUserDialog.confirmYes' }));
    const { cmdId, value } = findLastSessionCommand(Command_Report_ext);
    expect(value).toMatchObject({ reportedUser: 'P2', gameId: 42, description: 'abusive game chat' });
    expect(value.chatLog).toMatch(/^\[\d{2}:\d{2}:\d{2}\] P2: rude message$/);
    ok(cmdId);
    expect(await screen.findByText('ReportUserDialog.submittedMessage')).toBeInTheDocument();
  });

  it('keeps replay chat authors inert', () => {
    renderGameChat(true);
    expect(screen.getByText('rude message')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'P2' })).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByText('P2:'));
    expect(screen.queryByRole('menuitem', { name: /ReportUserDialog.menuItem/ })).not.toBeInTheDocument();
  });

  it('settles an empty wire list and permits another empty refresh', () => {
    loginTo31();
    renderFeatureScreen(<MyReports />, RouteEnum.MY_REPORTS);
    for (let request = 0; request < 2; request++) {
      const list = findLastSessionCommand(Command_ReportMyList_ext);
      act(() => deliverMessage(buildResponseMessage(buildResponse({
        cmdId: list.cmdId, responseCode: Response_ResponseCode.RespOk,
        ext: Response_ReportMyList_ext, value: create(Response_ReportMyListSchema),
      }))));
      expect(screen.getByTestId('report-list-status')).toHaveTextContent('Reports.count');
      const refresh = screen.getByRole('button', { name: /Reports.refresh/ });
      expect(refresh).toBeEnabled();
      fireEvent.click(refresh);
      expect(findLastSessionCommand(Command_ReportMyList_ext).cmdId).toBeGreaterThan(list.cmdId);
    }
  });

  it('submits a report over the wire and confirms it', async () => {
    loginTo31();
    renderFeatureScreen(<ReportUserProvider><ReportButton /></ReportUserProvider>);

    fireEvent.click(screen.getByText('report'));
    fireEvent.change(screen.getByLabelText('ReportUserDialog.descriptionGroup'), { target: { value: 'called me names' } });
    fireEvent.click(screen.getByRole('button', { name: 'ReportUserDialog.submit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ReportUserDialog.confirmYes' }));

    const { cmdId, value } = findLastSessionCommand(Command_Report_ext);
    expect(value).toMatchObject({
      reportedUser: 'mallory',
      category: 'cheating',
      description: 'called me names',
      chatLog: '[10:00:00] mallory: rude',
    });
    ok(cmdId);
    expect(await screen.findByText('ReportUserDialog.submittedMessage')).toBeInTheDocument();
  });

  it('lists own reports, opens the thread and posts a comment', () => {
    loginTo31();
    renderFeatureScreen(
      <Routes>
        <Route path={RouteEnum.MY_REPORTS} element={<MyReports />} />
      </Routes>,
      RouteEnum.MY_REPORTS,
    );

    const list = findLastSessionCommand(Command_ReportMyList_ext);
    act(() => deliverMessage(buildResponseMessage(buildResponse({
      cmdId: list.cmdId,
      responseCode: Response_ResponseCode.RespOk,
      ext: Response_ReportMyList_ext,
      value: create(Response_ReportMyListSchema, {
        reports: [create(ServerInfo_ReportSchema, { reportId: 5, reportedUserName: 'mallory', status: 'assigned', category: 'spam' })],
      }),
    }))));
    fireEvent.click(screen.getByTestId('report-row-5'));

    const details = findLastSessionCommand(Command_ReportDetails_ext);
    act(() => deliverMessage(buildResponseMessage(buildResponse({
      cmdId: details.cmdId,
      responseCode: Response_ResponseCode.RespOk,
      ext: Response_ReportDetails_ext,
      value: create(Response_ReportDetailsSchema, {
        report: create(ServerInfo_ReportSchema, {
          reportId: 5,
          status: 'assigned',
          comments: [create(ServerInfo_ReportCommentSchema, { authorName: 'modA', commentText: 'Looking into it', isModerator: true })],
        }),
      }),
    }))));
    expect(screen.getByTestId('report-thread').textContent).toContain('Looking into it');

    fireEvent.change(screen.getByLabelText('Reports.thread.addComment'), { target: { value: 'thanks' } });
    fireEvent.click(screen.getByRole('button', { name: /Reports.thread.send/ }));
    const comment = findLastSessionCommand(Command_ReportAddComment_ext);
    expect(comment.value).toMatchObject({ reportId: 5, comment: 'thanks' });
    ok(comment.cmdId);
    expect(findLastSessionCommand(Command_ReportMyList_ext).cmdId).toBeGreaterThan(list.cmdId);
  });
});
