import { ReportStatus } from '@cockatrice/datatrice';

import { formatLocalDateTime } from '@app/utils';

export function formatReportCategory(category: string): string {
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatReportTime(secondsSinceEpoch: bigint): string {
  return formatLocalDateTime(new Date(Number(secondsSinceEpoch) * 1000));
}

export function formatReportDate(secondsSinceEpoch: bigint): string {
  return formatReportTime(secondsSinceEpoch).slice(0, 10);
}

export function reportStatusClass(status: string): string {
  switch (status) {
    case ReportStatus.OPEN:
      return 'text-danger';
    case ReportStatus.ASSIGNED:
      return 'text-warning';
    case ReportStatus.RESOLVED:
      return 'text-success';
    case ReportStatus.DISMISSED:
      return 'text-text-muted';
    default:
      return '';
  }
}
