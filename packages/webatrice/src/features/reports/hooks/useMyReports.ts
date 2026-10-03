import { useCallback, useEffect, useRef, useState } from 'react';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_Report } from '@cockatrice/sockatrice/generated';
import { useAppSelector } from '@app/store';

import { useReportListLoad, type ReportListLoadState } from './useReportListLoad';
import { useReportThread, type ReportThread } from './useReportThread';

const MY_LIST_FAILURE = { type: server.Types.SESSION_COMMAND_FAILED, command: 'reportMyList' };

export interface MyReports {
  reports: ServerInfo_Report[];
  loadState: ReportListLoadState;
  refresh: () => void;
  selectedId: number | null;
  selected: ServerInfo_Report | undefined;
  select: (reportId: number) => void;
  thread: ReportThread;
}

/**
 * The caller's own reports (desktop DlgMyReports). Loads on mount, keeps the
 * selection across refreshes, and refreshes when a REPORT_RESOLVED or
 * REPORT_COMMENT notification arrives so a resolution shows up without
 * pressing Refresh.
 */
export function useMyReports(): MyReports {
  const webClient = useWebClient();
  const reports = useAppSelector(server.Selectors.getMyReports);
  const lastNotice = useAppSelector(server.Selectors.getLastReportNotice);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useAppSelector((state) =>
    (selectedId != null ? server.Selectors.getReport(state, selectedId) : undefined));

  const send = useCallback(() => webClient.request.session.reportMyList(), [webClient]);
  const { loadState, refresh: refreshList } = useReportListLoad(reports, send, MY_LIST_FAILURE);

  const thread = useReportThread(selectedId, () => refresh());
  const { reloadDetails } = thread;

  const refresh = useCallback(() => {
    refreshList();
    reloadDetails();
  }, [refreshList, reloadDetails]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // Skip the notice already in the store when the page opens.
  const seenNotice = useRef(lastNotice);
  useEffect(() => {
    if (lastNotice && lastNotice !== seenNotice.current) {
      seenNotice.current = lastNotice;
      refresh();
    }
  }, [lastNotice, refresh]);

  return {
    reports,
    loadState,
    refresh,
    selectedId: selected ? selectedId : null,
    selected,
    select: setSelectedId,
    thread,
  };
}
