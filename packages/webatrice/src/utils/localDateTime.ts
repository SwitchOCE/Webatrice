const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Local "yyyy-MM-dd HH:mm", the format desktop uses for report times
 * (report_utils::formatReportTime) and the server statistics snapshot.
 */
export function formatLocalDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
