import { ReportStatus } from '@cockatrice/datatrice';

import { formatLocalDateTime } from '@app/utils';

/** Desktop report_utils::formatReportCategory: "bug_abuse" -> "Bug abuse". */
export function formatReportCategory(category: string): string {
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Desktop report_utils::formatReportTime: epoch seconds as local "yyyy-MM-dd hh:mm". */
export function formatReportTime(secondsSinceEpoch: bigint): string {
  return formatLocalDateTime(new Date(Number(secondsSinceEpoch) * 1000));
}

/** Local "yyyy-MM-dd" for an epoch-seconds timestamp. */
export function formatReportDate(secondsSinceEpoch: bigint): string {
  return formatReportTime(secondsSinceEpoch).slice(0, 10);
}

/**
 * Desktop report_utils::reportStatusColor: open red, assigned amber, resolved
 * green, dismissed muted; any other status keeps the default text colour.
 */
export function reportStatusClass(status: string): string {
  switch (status) {
    case ReportStatus.OPEN:
      return 'text-red-400';
    case ReportStatus.ASSIGNED:
      return 'text-amber-400';
    case ReportStatus.RESOLVED:
      return 'text-emerald-400';
    case ReportStatus.DISMISSED:
      return 'text-text-muted';
    default:
      return '';
  }
}
