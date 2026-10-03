import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import {
  Event_NotifyUser,
  Response_ReportStats,
  ServerInfo_Report,
  ServerInfo_ReportSchema,
} from '@cockatrice/sockatrice/generated';
import { cloneWith } from '../../common';
import { ServerState, ServerStateReports } from './server.interfaces';
import { ReportStatus } from './server.reports';

export const initialReportsState: ServerStateReports = {
  mine: null,
  queue: null,
  queueTotalCount: 0,
  byId: {},
  details: {},
  stats: null,
  replay: null,
  lastNotice: null,
};

// Rows are shared by "my reports" and the moderator queue (a moderator's own
// report sits in both), so a list arrival only drops rows neither list holds.
function pruneRows(reports: ServerStateReports): void {
  const keep = new Set<number>([...(reports.mine ?? []), ...(reports.queue ?? [])]);
  for (const id of Object.keys(reports.byId)) {
    if (!keep.has(Number(id))) {
      delete reports.byId[Number(id)];
    }
  }
}

function storeRows(reports: ServerStateReports, rows: ServerInfo_Report[]): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    reports.byId[row.reportId] = row;
    ids.push(row.reportId);
  }
  return ids;
}

// Applies a server-confirmed status change to a stored row and its details.
// Fresh clones, never in-place writes: Immer can't draft protobuf-es messages
// (see datatrice-store.instructions.md#reducer-author-hazards).
function patchReport(reports: ServerStateReports, reportId: number, patch: Partial<ServerInfo_Report>): void {
  const row = reports.byId[reportId];
  if (row) {
    reports.byId[reportId] = cloneWith(ServerInfo_ReportSchema, row, patch);
  }
  const detail = reports.details[reportId];
  if (detail) {
    reports.details[reportId] = cloneWith(ServerInfo_ReportSchema, detail, patch);
  }
}

export const reportReducers = {
  // Command_ReportMyList: the caller's reports, newest first, at most 200.
  reportMyList: ((state, action) => {
    state.reports.mine = storeRows(state.reports, action.payload.reports);
    pruneRows(state.reports);
  }) as CaseReducer<ServerState, PayloadAction<{ reports: ServerInfo_Report[] }>>,

  // Command_ReportList: one page of the moderator queue, newest first.
  reportList: ((state, action) => {
    state.reports.queue = storeRows(state.reports, action.payload.reports);
    state.reports.queueTotalCount = action.payload.totalCount;
    pruneRows(state.reports);
  }) as CaseReducer<ServerState, PayloadAction<{ reports: ServerInfo_Report[]; totalCount: number }>>,

  // Command_ReportDetails adds the chat log and comment thread the lists omit.
  // It is also the freshest copy of the row, so a listed row is replaced too.
  reportDetails: ((state, action) => {
    const { report } = action.payload;
    state.reports.details[report.reportId] = report;
    if (state.reports.byId[report.reportId]) {
      state.reports.byId[report.reportId] = report;
    }
  }) as CaseReducer<ServerState, PayloadAction<{ report: ServerInfo_Report }>>,

  // Servatrice cmdReportAssign: status 'assigned', assigned_to = the caller.
  reportAssigned: ((state, action) => {
    patchReport(state.reports, action.payload.reportId, {
      status: ReportStatus.ASSIGNED,
      assignedModName: state.user?.name ?? '',
    });
  }) as CaseReducer<ServerState, PayloadAction<{ reportId: number }>>,

  // Servatrice cmdReportResolve: status 'resolved', or 'dismissed' when dismissed.
  reportResolved: ((state, action) => {
    const { reportId, dismissed } = action.payload;
    patchReport(state.reports, reportId, { status: dismissed ? ReportStatus.DISMISSED : ReportStatus.RESOLVED });
  }) as CaseReducer<ServerState, PayloadAction<{ reportId: number; dismissed: boolean }>>,

  reportStats: ((state, action) => {
    state.reports.stats = action.payload.stats;
  }) as CaseReducer<ServerState, PayloadAction<{ stats: Response_ReportStats }>>,

  // Only the latest download is kept: the queue opens it right away.
  // The bytes travel bare, not inside the response message: the dev freeze
  // guard can't freeze a message holding a byte array (like replayDownloaded).
  reportReplayDownloaded: ((state, action) => {
    state.reports.replay = action.payload;
  }) as CaseReducer<ServerState, PayloadAction<{ gameId: number; replayId: number; replayData: Uint8Array }>>,

  // REPORT_RESOLVED / REPORT_COMMENT, also kept in `notifications`. Each notice
  // is a new object, so a view tells a new one from the one it last handled by
  // identity: that survives the slice reset on disconnect, where a counter kept
  // here would restart and repeat a value a long-lived view already saw.
  reportNotified: ((state, action) => {
    state.reports.lastNotice = { notification: action.payload.notification };
  }) as CaseReducer<ServerState, PayloadAction<{ notification: Event_NotifyUser }>>,
};
