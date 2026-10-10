import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';

import { formatReportCategory } from '../reportFormat';
import type { ReportListLoadState } from '../hooks/useReportListLoad';

interface ReportStatsPanelProps {
  open: boolean;
  onToggle: (open: boolean) => void;
  state: ReportListLoadState;
}

export default function ReportStatsPanel({ open, onToggle, state }: ReportStatsPanelProps) {
  const { t } = useTranslation();
  const stats = useAppSelector(server.Selectors.getReportStats);

  let body: React.ReactNode;
  if (state === 'failed') {
    body = <p>{t('Reports.stats.failed')}</p>;
  } else if (state === 'loading' || !stats) {
    body = <p>{t('Reports.stats.loading')}</p>;
  } else {
    const { reportsThisWeek: thisWeek, reportsLastWeek: lastWeek } = stats;
    let change: string;
    if (lastWeek > 0) {
      change = `${(((thisWeek - lastWeek) * 100) / lastWeek).toFixed(0)}%`;
    } else {
      change = thisWeek > 0 ? t('Reports.stats.weekChangeNew') : '0%';
    }
    body = (
      <>
        <p>
          {t('Reports.stats.total', {
            total: stats.totalReports,
            open: stats.totalPending,
            assigned: stats.totalAssigned,
            resolved: stats.totalResolved,
          })}
        </p>
        <p>
          {t('Reports.stats.trend', {
            day: stats.reportsLast24h,
            week: stats.reportsLast7d,
            month: stats.reportsLast30d,
            hours: stats.avgResolutionHours.toFixed(1),
          })}
          {'  |  '}
          {t('Reports.stats.weekCompare', { thisWeek, lastWeek, change })}
        </p>
        <p>{t('Reports.stats.byCategory')}</p>
        <pre className="max-h-40 overflow-y-auto rounded-md bg-bg-base p-2 text-xs" data-testid="report-stats-detail">
          {[
            t('Reports.stats.topCategories'),
            ...stats.categoryCounts.map((c) => `  ${formatReportCategory(c.category)}: ${c.count}`),
            '',
            t('Reports.stats.mostReported'),
            ...stats.topReportedUsers.map((u) => `  ${t('Reports.stats.reportedCount', { user: u.userName, count: u.count })}`),
            '',
            t('Reports.stats.topReporters'),
            ...stats.topReporters.map((u) => `  ${t('Reports.stats.filedCount', { user: u.userName, count: u.count })}`),
          ].join('\n')}
        </pre>
      </>
    );
  }

  return (
    <section className="rounded-md border border-border-subtle p-3 text-sm" aria-label={t('Reports.stats.title')}>
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <input type="checkbox" checked={open} onChange={(e) => onToggle(e.target.checked)} />
        {t('Reports.stats.title')}
      </label>
      {open && <div className="mt-2 flex flex-col gap-1" data-testid="report-stats">{body}</div>}
    </section>
  );
}
