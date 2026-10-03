import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';

import type { ServerInfo_Report } from '@cockatrice/sockatrice/generated';
import { useGridRows } from '@app/hooks';

import { formatReportCategory, formatReportTime, reportStatusClass } from '../reportFormat';

export type ReportColumn =
  | 'id' | 'time' | 'reporter' | 'reportedUser' | 'category' | 'gameId' | 'status' | 'assignedTo' | 'replay' | 'room';

/** Desktop DlgMyReports columns. */
export const MY_REPORT_COLUMNS: ReportColumn[] = ['id', 'time', 'reportedUser', 'category', 'gameId', 'status', 'assignedTo'];

/** Desktop TabReport columns. */
export const QUEUE_COLUMNS: ReportColumn[] = [
  'id', 'time', 'reporter', 'reportedUser', 'category', 'gameId', 'status', 'assignedTo', 'replay', 'room',
];

type SortValue = number | string;

const SORT_VALUE: Record<ReportColumn, (r: ServerInfo_Report) => SortValue> = {
  id: (r) => r.reportId,
  time: (r) => Number(r.reportTime),
  reporter: (r) => r.reporterName.toLowerCase(),
  reportedUser: (r) => r.reportedUserName.toLowerCase(),
  category: (r) => r.category,
  gameId: (r) => r.gameId,
  status: (r) => r.status,
  assignedTo: (r) => r.assignedModName.toLowerCase(),
  replay: (r) => (r.replayId > 0 ? 1 : 0),
  room: (r) => r.roomId,
};

interface ReportTableProps {
  reports: ServerInfo_Report[];
  columns: ReportColumn[];
  selectedId: number | null;
  onSelect: (reportId: number) => void;
  /** Accessible name of the grid. */
  label: string;
}

/**
 * Report list shared by My Reports and the Report Queue, mirroring desktop's
 * QTableWidget: single-row selection, header-click sorting, status colours
 * (report_utils::fillReportTableRow). Lists are capped server-side (200 own
 * reports, one 100-row queue page), so rows render directly. Rows are a
 * keyboard grid like the QTableWidget: ↑/↓/Home/End move the selection.
 */
export default function ReportTable({ reports, columns, selectedId, onSelect, label }: ReportTableProps) {
  const { t } = useTranslation();
  // No sort until a header is clicked: rows keep the server's newest-first order.
  const [sort, setSort] = useState<{ column: ReportColumn; ascending: boolean } | null>(null);

  const rows = useMemo(() => {
    if (!sort) {
      return reports;
    }
    const value = SORT_VALUE[sort.column];
    return [...reports].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.ascending ? cmp : -cmp;
    });
  }, [reports, sort]);

  const grid = useGridRows({
    keys: rows.map((r) => String(r.reportId)),
    selectedKey: selectedId != null ? String(selectedId) : null,
    onSelect: (key) => onSelect(Number(key)),
    // Desktop's table has no activation action; Enter selects like Space.
    onActivate: (key) => onSelect(Number(key)),
  });

  const toggleSort = (column: ReportColumn) => {
    setSort((prev) => (prev?.column === column ? { column, ascending: !prev.ascending } : { column, ascending: true }));
  };

  const cell = (r: ServerInfo_Report, column: ReportColumn) => {
    switch (column) {
      case 'id':
        return r.reportId;
      case 'time':
        return formatReportTime(r.reportTime);
      case 'reporter':
        return r.reporterName;
      case 'reportedUser':
        return r.reportedUserName;
      case 'category':
        return formatReportCategory(r.category);
      case 'gameId':
        return r.gameId > 0 ? r.gameId : '';
      case 'status':
        return <span className={reportStatusClass(r.status)}>{r.status}</span>;
      case 'assignedTo':
        return r.assignedModName;
      case 'replay':
        return r.replayId > 0 ? t('Reports.column.yes') : t('Reports.column.no');
      case 'room':
        return r.roomId > 0 ? r.roomId : '';
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border-subtle">
      <table className="w-full text-sm text-left" role="grid" aria-label={label}>
        <thead className="sticky top-0 bg-bg-elevated text-xs uppercase text-text-muted">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="px-2 py-1.5 font-semibold whitespace-nowrap"
                aria-sort={sort?.column === column ? (sort.ascending ? 'ascending' : 'descending') : undefined}
              >
                <button type="button" className="flex items-center gap-1" onClick={() => toggleSort(column)}>
                  {t(`Reports.column.${column}`)}
                  {sort?.column === column && (sort.ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => {
            const selected = r.reportId === selectedId;
            return (
              <tr
                key={r.reportId}
                {...grid.getRowProps(String(r.reportId))}
                aria-selected={selected}
                data-testid={`report-row-${r.reportId}`}
                onClick={() => onSelect(r.reportId)}
                className={[
                  'cursor-pointer',
                  selected ? 'bg-accent/25' : index % 2 ? 'bg-bg-base/40' : '',
                  'hover:bg-bg-elevated',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                ].join(' ')}
              >
                {columns.map((column) => (
                  <td key={column} className="px-2 py-1 whitespace-nowrap text-text-primary">{cell(r, column)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
