import type { ServerInfo_Report } from '@cockatrice/sockatrice/generated';

/**
 * Report lifecycle states as Servatrice stores them in `{prefix}_reports.status`
 * (serversocketinterface.cpp cmdReport / cmdReportAssign / cmdReportResolve).
 * The wire carries the raw string, so unknown values pass through untouched.
 */
export const ReportStatus = {
  OPEN: 'open',
  ASSIGNED: 'assigned',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const;

export type ReportStatus = typeof ReportStatus[keyof typeof ReportStatus];

export interface ReportStatusCounts {
  open: number;
  assigned: number;
  resolved: number;
  dismissed: number;
}

/**
 * Open and assigned reports still take comments, assignment and resolution;
 * Servatrice rejects all three with RespInvalidData once a report is resolved
 * or dismissed. Desktop gates its comment box and action buttons the same way.
 */
export function isReportOpen(status: string): boolean {
  return status === ReportStatus.OPEN || status === ReportStatus.ASSIGNED;
}

/**
 * Desktop TabReport::applyFilters: a case-insensitive substring match on
 * reporter, reported user, category and description, plus an exact status
 * match ('' = any status).
 */
export function filterReports(reports: ServerInfo_Report[], search: string, status: string): ServerInfo_Report[] {
  const needle = search.toLowerCase();
  if (!needle && !status) {
    return reports;
  }
  return reports.filter((r) => {
    const matchesSearch = !needle
      || r.reporterName.toLowerCase().includes(needle)
      || r.reportedUserName.toLowerCase().includes(needle)
      || r.category.toLowerCase().includes(needle)
      || r.description.toLowerCase().includes(needle);
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesStatus;
  });
}

/** Desktop TabReport::updateStats: per-status tally over the loaded queue. */
export function countReportStatuses(reports: ServerInfo_Report[]): ReportStatusCounts {
  const counts: ReportStatusCounts = { open: 0, assigned: 0, resolved: 0, dismissed: 0 };
  for (const r of reports) {
    if (r.status === ReportStatus.OPEN) {
      counts.open++;
    } else if (r.status === ReportStatus.ASSIGNED) {
      counts.assigned++;
    } else if (r.status === ReportStatus.RESOLVED) {
      counts.resolved++;
    } else if (r.status === ReportStatus.DISMISSED) {
      counts.dismissed++;
    }
  }
  return counts;
}
