import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

import { rooms, server, ServerCapability } from '@cockatrice/datatrice';
import { AuthGuard, ModGuard } from '@app/components';
import { AlertDialog, PromptDialog } from '@app/dialogs';
import { Layout } from '@app/feature-wrappers/layout';
import { useAppDispatch, useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import ReportStatsPanel from './components/ReportStatsPanel';
import ReportTable, { QUEUE_COLUMNS } from './components/ReportTable';
import ReportThread from './components/ReportThread';
import ReportUserContextPanel from './components/ReportUserContextPanel';
import { listStatusText, REPORT_BUTTON_CLASS } from './components/reportUi';
import { useReportQueue } from './hooks/useReportQueue';

const STATUS_FILTERS = ['', 'open', 'assigned', 'resolved', 'dismissed'] as const;

const INPUT_CLASS =
  'bg-bg-base border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary '
  + 'focus:outline-none focus:border-accent';

/**
 * Moderator "Report Queue" (desktop TabReport). Moderator-only, and hidden on
 * servers without the 3.1 moderation commands.
 */
const ReportQueue = () => {
  const supported = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.MODERATION_TOOLS));
  return supported ? <ReportQueueView /> : <Navigate to={RouteEnum.SERVER} />;
};

const ReportQueueView = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const joinError = useAppSelector(rooms.Selectors.getJoinGameError);
  const q = useReportQueue();

  // Desktop TabReport::updateStats tallies the whole loaded page, not the filtered rows.
  const counts = useAppSelector(server.Selectors.getReportQueueStatusCounts);

  return (
    <Layout>
      <AuthGuard />
      <ModGuard />
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-4" data-testid="report-queue">
        <h1 className="font-modern text-xl font-semibold text-text-primary">{t('Reports.queue.title')}</h1>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label={t('Reports.queue.searchPlaceholder')}
            placeholder={t('Reports.queue.searchPlaceholder')}
            className={`${INPUT_CLASS} w-64`}
            value={q.search}
            onChange={(e) => q.setSearch(e.target.value)}
          />
          <select
            aria-label={t('Reports.column.status')}
            className={INPUT_CLASS}
            value={q.statusFilter}
            onChange={(e) => q.setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status ? t(`Reports.status.${status}`) : t('Reports.queue.allStatuses')}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={q.unresolvedOnly}
              onChange={(e) => q.setUnresolvedOnly(e.target.checked)}
            />
            {t('Reports.queue.unresolvedOnly')}
          </label>
          <div className="flex-1" />
          <button type="button" className={REPORT_BUTTON_CLASS} onClick={q.refresh} disabled={q.loadState === 'loading'}>
            <RefreshCw size={14} /> {t('Reports.refresh')}
          </button>
        </div>

        <p className="text-sm text-text-muted" data-testid="report-queue-counts">
          {t('Reports.queue.statusCounts', { ...counts })}
          {q.totalCount > q.loadedCount && ` (${t('Reports.queue.shownOfTotal', { shown: q.loadedCount, total: q.totalCount })})`}
        </p>

        <div className="flex min-h-[16rem] flex-col">
          <ReportTable reports={q.reports} columns={QUEUE_COLUMNS} selectedId={q.selectedId} onSelect={q.select} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={REPORT_BUTTON_CLASS} disabled={!q.actions.canAssign} onClick={q.assign}>
            {t('Reports.queue.assign')}
          </button>
          <button type="button" className={REPORT_BUTTON_CLASS} disabled={!q.actions.canResolve} onClick={q.resolve}>
            {t('Reports.queue.resolve')}
          </button>
          <button
            type="button"
            className={REPORT_BUTTON_CLASS}
            disabled={!q.actions.canResolve}
            onClick={() => q.promptResolve(false)}
          >
            {t('Reports.queue.resolveWithNote')}
          </button>
          <button
            type="button"
            className={REPORT_BUTTON_CLASS}
            disabled={!q.actions.canResolve}
            onClick={() => q.promptResolve(true)}
          >
            {t('Reports.queue.dismiss')}
          </button>
          <span className="w-4" />
          <button
            type="button"
            className={REPORT_BUTTON_CLASS}
            disabled={!q.actions.canDownloadReplay}
            onClick={q.downloadReplay}
          >
            {t('Reports.queue.downloadReplay')}
          </button>
          <button type="button" className={REPORT_BUTTON_CLASS} disabled={!q.actions.canJoinGame} onClick={q.joinGame}>
            {t('Reports.queue.joinGame')}
          </button>
          <div className="flex-1" />
          <span className="text-sm text-text-muted" role="status" data-testid="report-queue-status">
            {q.actionMessage ? t(`Reports.queue.${q.actionMessage}`) : listStatusText(t, q.loadState, q.reports.length)}
          </span>
        </div>

        {q.selected ? (
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <ReportThread
              report={q.selected}
              details={q.thread.details}
              detailsFailed={q.thread.detailsFailed}
              reporterPrefix={t('Reports.thread.reporterPrefix')}
              commentsTitle={t('Reports.thread.commentsThread')}
              openPlaceholder={t('Reports.thread.replyPlaceholder')}
              commentDraft={q.thread.commentDraft}
              onCommentDraftChange={q.thread.setCommentDraft}
              onSendComment={q.thread.sendComment}
              commentBusy={q.thread.commentBusy}
            />
            {q.selected.reportedUserName && (
              <ReportUserContextPanel userName={q.selected.reportedUserName} failed={q.userInfoFailed} />
            )}
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t('Reports.thread.selectReport')}</p>
        )}
        {q.thread.commentFailed && <p role="alert" className="text-sm text-red-400">{t('Reports.thread.commentFailed')}</p>}

        <ReportStatsPanel open={q.statsOpen} onToggle={q.setStatsOpen} state={q.statsState} />
      </div>

      <PromptDialog
        isOpen={q.resolvePrompt !== null}
        title={q.resolvePrompt?.dismissed ? t('Reports.queue.dismissTitle') : t('Reports.queue.resolveTitle')}
        label={q.resolvePrompt?.dismissed ? t('Reports.queue.dismissNoteLabel') : t('Reports.queue.resolveNoteLabel')}
        submitLabel={t('Reports.queue.ok')}
        onSubmit={q.submitResolvePrompt}
        onCancel={q.cancelResolvePrompt}
      />
      <AlertDialog
        isOpen={joinError !== null}
        title={t('Reports.queue.joinFailedTitle')}
        message={joinError?.message ?? ''}
        onDismiss={() => dispatch(rooms.Actions.clearJoinGameError())}
      />
    </Layout>
  );
};

export default ReportQueue;
