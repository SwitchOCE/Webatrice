// Moderation-queue commands (Cockatrice 3.1, #7091).

vi.mock('../../WebClient');

import { create, isFieldSet } from '@bufbuild/protobuf';
import { Mock } from 'vitest';
import { makeCallbackHelpers } from '../../testing/callback-helpers';
import { WebClient } from '../../WebClient';
import {
  Command_ReplayDownloadByGameId_ext,
  Command_ReportAssign_ext,
  Command_ReportList_ext,
  Command_ReportListSchema,
  Command_ReportResolve_ext,
  Command_ReportStats_ext,
  Command_ReportUserInfo_ext,
  Response_ReplayDownloadByGameId_ext,
  Response_ReportList_ext,
  Response_ReportStats_ext,
  Response_ReportUserInfo_ext,
  Response_ResponseCode,
  ServerInfo_ReportSchema,
} from '../../generated';

import { replayDownloadByGameId } from './replayDownloadByGameId';
import { reportAssign } from './reportAssign';
import { reportList } from './reportList';
import { reportResolve } from './reportResolve';
import { reportStats } from './reportStats';
import { reportUserInfo } from './reportUserInfo';

const { invokeOnSuccess, invokeOnError } = makeCallbackHelpers(
  WebClient.instance.protobuf.sendModeratorCommand as Mock,
  2
);

describe('reportList', () => {

  it('calls sendModeratorCommand with Command_ReportList and paging fields', () => {
    reportList(true, 100, 50);
    expect(WebClient.instance.protobuf.sendModeratorCommand).toHaveBeenCalledWith(
      Command_ReportList_ext,
      expect.objectContaining({ unresolvedOnly: true, offset: 100, limit: 50 }),
      expect.objectContaining({ responseExt: Response_ReportList_ext })
    );
  });

  it('keeps the proto paging defaults when offset and limit are omitted', () => {
    reportList();
    const sent = (WebClient.instance.protobuf.sendModeratorCommand as Mock).mock.calls.at(-1)![1];
    expect(isFieldSet(sent, Command_ReportListSchema.field.limit)).toBe(false);
    expect(sent).toMatchObject({ offset: 0, limit: 100 });
  });

  it('onSuccess forwards reports and totalCount to response.moderator.reportList', () => {
    reportList(true);
    const reports = [create(ServerInfo_ReportSchema, { reportId: 1, reportedUserName: 'mallory' })];
    invokeOnSuccess({ reports, totalCount: 12 });
    expect(WebClient.instance.response.moderator.reportList).toHaveBeenCalledWith(reports, 12);
  });

  it('does not call response.moderator.reportList on RespLoginNeeded (not a moderator)', () => {
    reportList(true);
    invokeOnError(Response_ResponseCode.RespLoginNeeded);
    expect(WebClient.instance.response.moderator.reportList).not.toHaveBeenCalled();
  });
});

describe('reportAssign', () => {

  it('calls sendModeratorCommand with Command_ReportAssign', () => {
    reportAssign(4);
    expect(WebClient.instance.protobuf.sendModeratorCommand).toHaveBeenCalledWith(
      Command_ReportAssign_ext, expect.objectContaining({ reportId: 4 }), expect.any(Object)
    );
  });

  it('onSuccess calls response.moderator.reportAssigned', () => {
    reportAssign(4);
    invokeOnSuccess();
    expect(WebClient.instance.response.moderator.reportAssigned).toHaveBeenCalledWith(4);
  });
});

describe('reportResolve', () => {

  it('calls sendModeratorCommand with Command_ReportResolve', () => {
    reportResolve(4, 'warned', true);
    expect(WebClient.instance.protobuf.sendModeratorCommand).toHaveBeenCalledWith(
      Command_ReportResolve_ext,
      expect.objectContaining({ reportId: 4, resolutionNote: 'warned', dismissed: true }),
      expect.any(Object)
    );
  });

  it('onSuccess calls response.moderator.reportResolved, defaulting dismissed to false', () => {
    reportResolve(4);
    invokeOnSuccess();
    expect(WebClient.instance.response.moderator.reportResolved).toHaveBeenCalledWith(4, false);
  });

  it('does not call response.moderator.reportResolved on RespInvalidData', () => {
    reportResolve(4);
    invokeOnError(Response_ResponseCode.RespInvalidData);
    expect(WebClient.instance.response.moderator.reportResolved).not.toHaveBeenCalled();
  });
});

describe('reportUserInfo', () => {

  it('calls sendModeratorCommand with Command_ReportUserInfo', () => {
    reportUserInfo('mallory');
    expect(WebClient.instance.protobuf.sendModeratorCommand).toHaveBeenCalledWith(
      Command_ReportUserInfo_ext,
      expect.objectContaining({ userName: 'mallory' }),
      expect.objectContaining({ responseExt: Response_ReportUserInfo_ext })
    );
  });

  it('onSuccess forwards the response to response.moderator.reportUserInfo', () => {
    reportUserInfo('mallory');
    const resp = { userName: 'mallory', totalReports: 3 };
    invokeOnSuccess(resp);
    expect(WebClient.instance.response.moderator.reportUserInfo).toHaveBeenCalledWith(resp);
  });
});

describe('reportStats', () => {

  it('calls sendModeratorCommand with Command_ReportStats and forwards the stats', () => {
    reportStats();
    expect(WebClient.instance.protobuf.sendModeratorCommand).toHaveBeenCalledWith(
      Command_ReportStats_ext,
      expect.any(Object),
      expect.objectContaining({ responseExt: Response_ReportStats_ext })
    );
    const resp = { totalReports: 9, totalPending: 2 };
    invokeOnSuccess(resp);
    expect(WebClient.instance.response.moderator.reportStats).toHaveBeenCalledWith(resp);
  });
});

describe('replayDownloadByGameId', () => {

  it('calls sendModeratorCommand with Command_ReplayDownloadByGameId', () => {
    replayDownloadByGameId(77);
    expect(WebClient.instance.protobuf.sendModeratorCommand).toHaveBeenCalledWith(
      Command_ReplayDownloadByGameId_ext,
      expect.objectContaining({ gameId: 77 }),
      expect.objectContaining({ responseExt: Response_ReplayDownloadByGameId_ext })
    );
  });

  it('onSuccess forwards the replay keyed by game id', () => {
    replayDownloadByGameId(77);
    const resp = { replayId: 5, replayData: new Uint8Array([1, 2]) };
    invokeOnSuccess(resp);
    expect(WebClient.instance.response.moderator.replayDownloadedByGameId).toHaveBeenCalledWith(77, resp);
  });

  it('does not call the response contract on RespNameNotFound (no replay)', () => {
    replayDownloadByGameId(77);
    invokeOnError(Response_ResponseCode.RespNameNotFound);
    expect(WebClient.instance.response.moderator.replayDownloadedByGameId).not.toHaveBeenCalled();
  });
});

describe('report queue failure and completion callbacks', () => {

  it('reportList passes a failure code to onFailure without touching the response contract', () => {
    const onFailure = vi.fn();
    reportList(true, undefined, undefined, onFailure);
    invokeOnError(Response_ResponseCode.RespInternalError);
    expect(onFailure).toHaveBeenCalledWith(Response_ResponseCode.RespInternalError, expect.anything());
    expect(WebClient.instance.response.moderator.reportList).not.toHaveBeenCalled();
  });

  it('reportAssign calls onAssigned after the response contract on success', () => {
    const onAssigned = vi.fn();
    reportAssign(4, onAssigned);
    invokeOnSuccess();
    expect(WebClient.instance.response.moderator.reportAssigned).toHaveBeenCalledWith(4);
    expect(onAssigned).toHaveBeenCalled();
  });

  it('reportAssign passes RespInvalidData (already taken) to onFailure', () => {
    const onAssigned = vi.fn();
    const onFailure = vi.fn();
    reportAssign(4, onAssigned, onFailure);
    invokeOnError(Response_ResponseCode.RespInvalidData);
    expect(onFailure).toHaveBeenCalledWith(Response_ResponseCode.RespInvalidData, expect.anything());
    expect(onAssigned).not.toHaveBeenCalled();
    expect(WebClient.instance.response.moderator.reportAssigned).not.toHaveBeenCalled();
  });

  it('reportResolve reports success and failure to the caller', () => {
    const onResolved = vi.fn();
    const onFailure = vi.fn();
    reportResolve(4, 'note', false, onResolved, onFailure);
    invokeOnSuccess();
    expect(onResolved).toHaveBeenCalled();
    invokeOnError(Response_ResponseCode.RespInvalidData);
    expect(onFailure).toHaveBeenCalledWith(Response_ResponseCode.RespInvalidData, expect.anything());
  });

  it('reportStats and replayDownloadByGameId pass failures to onFailure', () => {
    const onFailure = vi.fn();
    reportStats(onFailure);
    invokeOnError(Response_ResponseCode.RespInternalError);
    replayDownloadByGameId(77, onFailure);
    invokeOnError(Response_ResponseCode.RespNameNotFound);
    expect(onFailure.mock.calls.map(([code]) => code)).toEqual([
      Response_ResponseCode.RespInternalError,
      Response_ResponseCode.RespNameNotFound,
    ]);
  });
});
