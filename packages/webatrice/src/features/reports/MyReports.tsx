import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

import { ServerCapability } from '@cockatrice/datatrice';
import { AuthGuard, CapabilityGuard } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';

import ReportTable, { MY_REPORT_COLUMNS } from './components/ReportTable';
import ReportThread from './components/ReportThread';
import { useMyReports } from './hooks/useMyReports';
import { listStatusText, REPORT_BUTTON_CLASS } from './components/reportUi';

const MyReportsContent = () => {
  const { t } = useTranslation();
  const { reports, loadState, refresh, selectedId, selected, select, thread } = useMyReports();

  return (
    <>
      <div className="flex h-full flex-col gap-3 p-4" data-testid="my-reports">
        <h1 className="font-modern text-xl font-semibold text-text-primary">{t('Reports.mine.title')}</h1>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-h-0 flex-[3] flex-col gap-2">
            <ReportTable reports={reports} columns={MY_REPORT_COLUMNS} selectedId={selectedId} onSelect={select} />
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted" role="status" data-testid="report-list-status">
                {listStatusText(t, loadState, reports.length)}
              </span>
              <button type="button" className={REPORT_BUTTON_CLASS} onClick={refresh} disabled={loadState === 'loading'}>
                <RefreshCw size={14} /> {t('Reports.refresh')}
              </button>
            </div>
          </div>
          <section className="flex min-h-0 flex-[2] flex-col overflow-y-auto" aria-label={t('Reports.thread.detailsGroup')}>
            {selected ? (
              <ReportThread
                report={selected}
                details={thread.details}
                detailsFailed={thread.detailsFailed}
                reporterPrefix={t('Reports.thread.youPrefix')}
                commentsTitle={t('Reports.thread.comments')}
                openPlaceholder={t('Reports.thread.commentPlaceholder')}
                commentDraft={thread.commentDraft}
                onCommentDraftChange={thread.setCommentDraft}
                onSendComment={thread.sendComment}
                commentBusy={thread.commentBusy}
              />
            ) : (
              <p className="text-sm text-text-muted">{t('Reports.thread.selectReport')}</p>
            )}
            {thread.commentFailed && <p role="alert" className="mt-2 text-sm text-danger">{t('Reports.thread.commentFailed')}</p>}
          </section>
        </div>
      </div>
    </>
  );
};

/**
 * "My Reports" (desktop DlgMyReports, opened from the Account tab): the
 * reports you filed with their status, and for the selected one its
 * description, chat log and comment thread with a reply box. Hidden on 3.0
 * servers; a stale route (e.g. restored after reconnecting to an older
 * server) falls back to the lobby before the body sends anything.
 */
const MyReports = () => (
  <Layout>
    <AuthGuard />
    <CapabilityGuard capability={ServerCapability.REPORTS}>
      <MyReportsContent />
    </CapabilityGuard>
  </Layout>
);

export default MyReports;
