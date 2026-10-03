// Cockatrice 3.1 protocol round trips: the new developer command family, a
// moderation-queue query, a caller-callback submission, a 3.1 login code and
// the new game event — encoded, correlated and dispatched end to end.

import { create } from '@bufbuild/protobuf';
import { describe, expect, it, vi } from 'vitest';

import * as Data from '../../src/generated';
import { AdminCommands, DeveloperCommands, GameCommands, ModeratorCommands, SessionCommands } from '../../src';
import { StatusEnum } from '../../src/types/StatusEnum';

import { connectAndLogin, getMockResponse } from '../../src/testing/setup';
import {
  buildGameEventMessage,
  buildResponse,
  buildResponseMessage,
  deliverMessage,
} from '../../src/testing/protobuf-builders';
import {
  findLastDeveloperCommand,
  findLastAdminCommand,
  findLastGameCommand,
  findLastModeratorCommand,
  findLastSessionCommand,
} from '../../src/testing/command-capture';

describe('Cockatrice 3.1 protocol', () => {
  it('setPlaymat encodes the game target and independent playmat parameters', () => {
    connectAndLogin();
    GameCommands.setPlaymat(12, { playmatParams: { cardName: 'Island', cardProviderId: 'provider', zoom: 1.5 } });
    const { gameId, value } = findLastGameCommand(Data.Command_SetPlaymat_ext);
    expect(gameId).toBe(12);
    expect(value.playmatParams).toMatchObject({ cardName: 'Island', cardProviderId: 'provider', zoom: 1.5 });
  });

  describe.each([
    {
      name: 'setCardArtParams for a profile card',
      send: (onSuccess: () => void, onFailure: (code: number) => void) =>
        SessionCommands.setCardArtParams({ cardName: 'Island', zoom: 1.5 }, onSuccess, onFailure),
      capture: () => findLastSessionCommand(Data.Command_SetCardArtParams_ext),
      wire: { cardName: 'Island', zoom: 1.5 },
      refusal: Data.Response_ResponseCode.RespFunctionNotAllowed,
    },
    {
      name: 'reportAddComment for report evidence',
      send: (onSuccess: () => void, onFailure: (code: number) => void) =>
        SessionCommands.reportAddComment(9, 'Evidence', onSuccess, onFailure),
      capture: () => findLastSessionCommand(Data.Command_ReportAddComment_ext),
      wire: { reportId: 9, comment: 'Evidence' },
      refusal: Data.Response_ResponseCode.RespAccessDenied,
    },
  ])('$name', (testCase) => {
    it('reports success only to the success callback', () => {
      connectAndLogin();
      const onSuccess = vi.fn();
      const onFailure = vi.fn();
      testCase.send(onSuccess, onFailure);
      const { cmdId, value } = testCase.capture();
      expect(value).toMatchObject(testCase.wire);
      deliverMessage(buildResponseMessage(buildResponse({ cmdId, responseCode: Data.Response_ResponseCode.RespOk })));
      expect(onSuccess).toHaveBeenCalledExactlyOnceWith();
      expect(onFailure).not.toHaveBeenCalled();
    });

    it('reports refusal only to the failure callback with the raw response', () => {
      connectAndLogin();
      const onSuccess = vi.fn();
      const onFailure = vi.fn();
      testCase.send(onSuccess, onFailure);
      const { cmdId, value } = testCase.capture();
      expect(value).toMatchObject(testCase.wire);
      const raw = buildResponse({ cmdId, responseCode: testCase.refusal });
      deliverMessage(buildResponseMessage(raw));
      expect(onFailure).toHaveBeenCalledExactlyOnceWith(testCase.refusal, raw);
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  it('resetUserPassword forwards an access denial without exposing a password', () => {
    connectAndLogin();
    const onReset = vi.fn();
    const onFailure = vi.fn();
    AdminCommands.resetUserPassword('alice', onReset, onFailure);
    const { cmdId, value } = findLastAdminCommand(Data.Command_ResetUserPassword_ext);
    expect(value.userName).toBe('alice');
    const raw = buildResponse({ cmdId, responseCode: Data.Response_ResponseCode.RespAccessDenied });
    deliverMessage(buildResponseMessage(raw));
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(Data.Response_ResponseCode.RespAccessDenied, raw);
    expect(onReset).not.toHaveBeenCalled();
  });

  it.each([
    [Data.Response_ResponseCode.RespAccountNotActivated, 'Login failed: account not activated'],
    [Data.Response_ResponseCode.RespServerFull, 'Login failed: server is full'],
    [Data.Response_ResponseCode.RespInvalidData, `Login failed: unknown error: ${Data.Response_ResponseCode.RespInvalidData}`],
  ] as const)('login preserves rejection code %s and its status message', (responseCode, message) => {
    connectAndLogin();
    vi.clearAllMocks();
    SessionCommands.login({ host: 'localhost', port: '4748', userName: 'alice' }, 'password');
    const { cmdId } = findLastSessionCommand(Data.Command_Login_ext);
    deliverMessage(buildResponseMessage(buildResponse({ cmdId, responseCode })));
    expect(getMockResponse().session.loginFailed).toHaveBeenCalledExactlyOnceWith(responseCode);
    expect(getMockResponse().session.loginSuccessful).not.toHaveBeenCalled();
    expect(getMockResponse().session.updateStatus).toHaveBeenCalledWith(StatusEnum.DISCONNECTED, message);
    if (responseCode === Data.Response_ResponseCode.RespAccountNotActivated) {
      expect(getMockResponse().session.accountAwaitingActivation).toHaveBeenCalledExactlyOnceWith({
        host: 'localhost', port: '4748', userName: 'alice'
      });
    } else {
      expect(getMockResponse().session.accountAwaitingActivation).not.toHaveBeenCalled();
    }
  });

  it('getServerStats travels in CommandContainer.developer_command and dispatches serverStats', () => {
    connectAndLogin();

    DeveloperCommands.getServerStats();

    const { container, cmdId } = findLastDeveloperCommand(Data.Command_GetServerStats_ext);
    expect(container.developerCommand).toHaveLength(1);
    expect(container.moderatorCommand).toHaveLength(0);

    deliverMessage(buildResponseMessage(buildResponse({
      cmdId,
      responseCode: Data.Response_ResponseCode.RespOk,
      ext: Data.Response_GetServerStats_ext,
      value: create(Data.Response_GetServerStatsSchema, { usersCount: 42n, gamesCount: 7n }),
    })));

    expect(getMockResponse().developer.serverStats).toHaveBeenCalledWith(
      expect.objectContaining({ usersCount: 42n, gamesCount: 7n }),
    );
  });

  it('developer viewLogHistory uses the dev_ext extension and lands in moderator.viewLogs', () => {
    connectAndLogin();

    DeveloperCommands.viewLogHistory({ userName: 'alice', dateRange: 1 });

    const { cmdId, value } = findLastDeveloperCommand(Data.Command_ViewLogHistory_dev_ext);
    expect(value.userName).toBe('alice');

    deliverMessage(buildResponseMessage(buildResponse({
      cmdId,
      responseCode: Data.Response_ResponseCode.RespOk,
      ext: Data.Response_ViewLogHistory_ext,
      value: create(Data.Response_ViewLogHistorySchema, {
        logMessage: [create(Data.ServerInfo_ChatMessageSchema, { senderName: 'alice' })],
      }),
    })));

    expect(getMockResponse().moderator.viewLogs).toHaveBeenCalledWith(
      [expect.objectContaining({ senderName: 'alice' })],
    );
  });

  it('reportList correlates the moderation-queue page', () => {
    connectAndLogin();

    ModeratorCommands.reportList(true, 0, 25);

    const { cmdId, value } = findLastModeratorCommand(Data.Command_ReportList_ext);
    expect(value).toMatchObject({ unresolvedOnly: true, limit: 25 });

    deliverMessage(buildResponseMessage(buildResponse({
      cmdId,
      responseCode: Data.Response_ResponseCode.RespOk,
      ext: Data.Response_ReportList_ext,
      value: create(Data.Response_ReportListSchema, {
        reports: [create(Data.ServerInfo_ReportSchema, { reportId: 9, reportedUserName: 'mallory' })],
        totalCount: 31,
      }),
    })));

    expect(getMockResponse().moderator.reportList).toHaveBeenCalledWith(
      [expect.objectContaining({ reportId: 9, reportedUserName: 'mallory' })],
      31,
    );
  });

  it('a refused moderation query reaches moderator.commandFailed with its target', () => {
    connectAndLogin();

    ModeratorCommands.reportUserInfo('mallory');

    const { cmdId } = findLastModeratorCommand(Data.Command_ReportUserInfo_ext);
    deliverMessage(buildResponseMessage(buildResponse({
      cmdId,
      responseCode: Data.Response_ResponseCode.RespNameNotFound,
    })));

    expect(getMockResponse().moderator.commandFailed).toHaveBeenCalledWith(
      'reportUserInfo',
      Data.Response_ResponseCode.RespNameNotFound,
      'mallory',
      undefined,
    );
    expect(getMockResponse().moderator.reportUserInfo).not.toHaveBeenCalled();
  });

  it('report reports a rate-limited submission to the caller', () => {
    connectAndLogin();
    const onSubmitted = vi.fn();
    const onFailure = vi.fn();

    SessionCommands.report({ reportedUser: 'mallory', category: 'cheating', description: 'x' }, onSubmitted, onFailure);

    const { cmdId } = findLastSessionCommand(Data.Command_Report_ext);
    deliverMessage(buildResponseMessage(buildResponse({
      cmdId,
      responseCode: Data.Response_ResponseCode.RespTooManyRequests,
    })));

    expect(onFailure).toHaveBeenCalledWith(Data.Response_ResponseCode.RespTooManyRequests, expect.anything());
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('a RespPasswordChangeRequired login reports its code to loginFailed', () => {
    connectAndLogin();

    SessionCommands.login({ host: 'h', port: '1', userName: 'alice' }, 'pw');
    const { cmdId } = findLastSessionCommand(Data.Command_Login_ext);

    deliverMessage(buildResponseMessage(buildResponse({
      cmdId,
      responseCode: Data.Response_ResponseCode.RespPasswordChangeRequired,
    })));

    expect(getMockResponse().session.loginFailed).toHaveBeenCalledWith(
      Data.Response_ResponseCode.RespPasswordChangeRequired,
    );
  });

  it('Event_GameLogNotice reaches game.gameLogNotice with the acting player', () => {
    connectAndLogin();

    deliverMessage(buildGameEventMessage({
      gameId: 12,
      playerId: 3,
      ext: Data.Event_GameLogNotice_ext,
      value: create(Data.Event_GameLogNoticeSchema, {
        noticeType: Data.Event_GameLogNotice_NoticeType.UNDO_DRAW_FAILED,
      }),
    }));

    expect(getMockResponse().game.gameLogNotice).toHaveBeenCalledWith(
      12, 3, Data.Event_GameLogNotice_NoticeType.UNDO_DRAW_FAILED,
    );
  });
});
