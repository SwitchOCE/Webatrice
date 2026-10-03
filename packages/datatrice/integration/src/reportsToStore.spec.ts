import { create } from '@bufbuild/protobuf';

import { attachResponseHandlers, createStore, server } from '../../src';
import {
  Event_NotifyUserSchema,
  Event_NotifyUser_NotificationType,
  Response_ReplayDownloadByGameIdSchema,
  Response_ReportStatsSchema,
  Response_ReportUserInfoSchema,
  ServerInfo_ReportSchema,
  ServerInfo_UserSchema,
} from '@cockatrice/sockatrice/generated';

// Integration: the report and moderation-queue responses (Cockatrice #7091)
// through attachResponseHandlers into a real store (dev freeze guard on),
// read back through server.Selectors as the views do.

function report(reportId: number, status: string) {
  return create(ServerInfo_ReportSchema, { reportId, status, reportedUserName: 'mallory', reporterName: 'alice' });
}

describe('integration: report handlers', () => {
  it('a reporter follows a report from filing to resolution', () => {
    const store = createStore();
    const response = attachResponseHandlers(store);

    response.session.reportMyList?.([report(1, 'open')]);
    expect(server.Selectors.getMyReports(store.getState()).map((r) => r.status)).toEqual(['open']);

    response.session.notifyUser(create(Event_NotifyUserSchema, {
      type: Event_NotifyUser_NotificationType.REPORT_RESOLVED,
      customTitle: 'Report Resolved',
      customContent: 'Your report about mallory has been resolved.',
    }));
    expect(server.Selectors.getLastReportNotice(store.getState())?.seq).toBe(1);

    response.session.reportMyList?.([create(ServerInfo_ReportSchema, { ...report(1, 'resolved'), resolutionNote: 'warned' })]);
    expect(server.Selectors.getMyReports(store.getState())[0]).toMatchObject({ status: 'resolved', resolutionNote: 'warned' });
  });

  it('a moderator works the queue: list, details, assign, resolve, context and stats', () => {
    const store = createStore();
    const response = attachResponseHandlers(store);
    response.session.updateUser(create(ServerInfo_UserSchema, { name: 'modA' }));

    response.moderator.reportList?.([report(1, 'open'), report(2, 'assigned')], 2);
    expect(server.Selectors.getReportQueueStatusCounts(store.getState())).toEqual({ open: 1, assigned: 1, resolved: 0, dismissed: 0 });

    response.session.reportDetails?.(create(ServerInfo_ReportSchema, { ...report(1, 'open'), chatLog: 'log' }));
    response.moderator.reportAssigned?.(1);
    expect(server.Selectors.getReportDetails(store.getState(), 1))
      .toMatchObject({ status: 'assigned', assignedModName: 'modA', chatLog: 'log' });

    response.moderator.reportResolved?.(1, true);
    expect(server.Selectors.getReport(store.getState(), 1)?.status).toBe('dismissed');

    response.moderator.reportUserInfo?.(create(Response_ReportUserInfoSchema, { userName: 'mallory', totalReports: 2 }));
    response.moderator.reportStats?.(create(Response_ReportStatsSchema, { totalReports: 2 }));
    response.moderator.replayDownloadedByGameId?.(5, create(Response_ReplayDownloadByGameIdSchema, {
      replayId: 8,
      replayData: new Uint8Array([1]),
    }));
    expect(server.Selectors.getUserInvestigation(store.getState(), 'mallory')?.info?.totalReports).toBe(2);
    expect(server.Selectors.getReportStats(store.getState())?.totalReports).toBe(2);
    expect(server.Selectors.getReportReplay(store.getState())).toEqual({ gameId: 5, replayId: 8, replayData: new Uint8Array([1]) });
  });
});
