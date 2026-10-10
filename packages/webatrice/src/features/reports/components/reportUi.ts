import type { ReportListLoadState } from '../hooks/useReportListLoad';

export const REPORT_BUTTON_CLASS =
  'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-text-secondary border border-border-subtle '
  + 'hover:text-text-primary hover:bg-bg-elevated disabled:opacity-50 disabled:cursor-not-allowed';

type Translate = (key: string, params?: Record<string, unknown>) => string;

export function listStatusText(t: Translate, loadState: ReportListLoadState, count: number): string {
  if (loadState === 'loading') {
    return t('Reports.loading');
  }
  if (loadState === 'failed') {
    return t('Reports.loadFailed');
  }
  return t('Reports.count', { count });
}
