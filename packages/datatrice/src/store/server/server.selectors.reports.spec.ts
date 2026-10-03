import { create } from '@bufbuild/protobuf';
import { Response_ReportStatsSchema } from '@cockatrice/sockatrice/generated';

import { Selectors } from './server.selectors';
import { ServerState } from './server.interfaces';
import { makeReport, makeReportsState, makeServerState } from '../../testing/fixtures/server';

function rootState(server: ServerState) {
  return { server };
}

describe('report selectors', () => {
  const a = makeReport({ reportId: 1, status: 'open' });
  const b = makeReport({ reportId: 2, status: 'assigned' });
  const c = makeReport({ reportId: 3, status: 'resolved' });

  it('getMyReports and getReportQueue resolve ids to rows in server order', () => {
    const state = rootState(makeServerState({
      reports: makeReportsState({ mine: [2, 1], queue: [3, 2, 1], byId: { 1: a, 2: b, 3: c } }),
    }));
    expect(Selectors.getMyReports(state)).toEqual([b, a]);
    expect(Selectors.getReportQueue(state)).toEqual([c, b, a]);
    expect(Selectors.getMyReportsLoaded(state)).toBe(true);
    expect(Selectors.getReportQueueLoaded(state)).toBe(true);
  });

  it('returns a stable empty list and not-loaded before the first load', () => {
    const state = rootState(makeServerState());
    expect(Selectors.getMyReports(state)).toBe(Selectors.getReportQueue(state));
    expect(Selectors.getMyReports(state)).toEqual([]);
    expect(Selectors.getMyReportsLoaded(state)).toBe(false);
    expect(Selectors.getReportQueueLoaded(state)).toBe(false);
  });

  it('memoizes the list across unrelated state changes', () => {
    const reports = makeReportsState({ mine: [1], byId: { 1: a } });
    const first = Selectors.getMyReports(rootState(makeServerState({ reports })));
    const second = Selectors.getMyReports(rootState(makeServerState({ reports, banUser: 'x' })));
    expect(second).toBe(first);
  });

  it('getReportQueueStatusCounts tallies the loaded queue', () => {
    const state = rootState(makeServerState({
      reports: makeReportsState({ queue: [1, 2, 3], byId: { 1: a, 2: b, 3: c } }),
    }));
    expect(Selectors.getReportQueueStatusCounts(state)).toEqual({ open: 1, assigned: 1, resolved: 1, dismissed: 0 });
  });

  it('reads single reports, details, stats, replay and the last notice', () => {
    const stats = create(Response_ReportStatsSchema, { totalReports: 4 });
    const state = rootState(makeServerState({
      reports: makeReportsState({
        queue: [1],
        queueTotalCount: 12,
        byId: { 1: a },
        details: { 1: a },
        stats,
        replay: { gameId: 5, replayId: 6, replayData: new Uint8Array() },
      }),
    }));
    expect(Selectors.getReport(state, 1)).toBe(a);
    expect(Selectors.getReportDetails(state, 1)).toBe(a);
    expect(Selectors.getReportDetails(state, 2)).toBeUndefined();
    expect(Selectors.getReportStats(state)).toBe(stats);
    expect(Selectors.getReportReplay(state)?.gameId).toBe(5);
    expect(Selectors.getReportQueueTotalCount(state)).toBe(12);
    expect(Selectors.getLastReportNotice(state)).toBeNull();
  });

  it('tolerates a preloaded state without the reports field', () => {
    const server: Partial<ServerState> = makeServerState();
    delete server.reports;
    expect(Selectors.getMyReports(rootState(server as ServerState))).toEqual([]);
    expect(Selectors.getReportStats(rootState(server as ServerState))).toBeNull();
  });
});
