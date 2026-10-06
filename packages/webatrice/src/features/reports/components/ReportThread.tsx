import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';

import { server } from '@cockatrice/datatrice';
import type { ServerInfo_Report } from '@cockatrice/sockatrice/generated';

import { formatReportTime } from '../reportFormat';

const PANEL_CLASS = 'flex flex-col gap-1 min-h-0';
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-text-muted';
const BOX_CLASS =
  'rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary '
  + 'whitespace-pre-wrap break-words overflow-y-auto';

export interface ReportThreadProps {
  /** The selected list row: description, status and resolution note. */
  report: ServerInfo_Report;
  /** The full report (chat log + comments); undefined while it loads. */
  details: ServerInfo_Report | undefined;
  detailsFailed: boolean;
  /** Label for comments written by the non-moderator side: "[You]" for the reporter, "[Reporter]" for staff. */
  reporterPrefix: string;
  /** Group title for the thread: "Comments:" in My Reports, "Comments / Thread" in the queue. */
  commentsTitle: string;
  openPlaceholder: string;
  commentDraft: string;
  onCommentDraftChange: (value: string) => void;
  onSendComment: () => void;
  commentBusy: boolean;
}

/**
 * Description, chat log and comment thread of one report, with the reply box.
 * Mirrors desktop report_utils::renderReportDetails ("[time] [Moderator]
 * author:" headers, plain-text bodies) and the comment gating of DlgMyReports
 * / TabReport: only open or assigned reports take comments.
 */
export default function ReportThread({
  report,
  details,
  detailsFailed,
  reporterPrefix,
  commentsTitle,
  openPlaceholder,
  commentDraft,
  onCommentDraftChange,
  onSendComment,
  commentBusy,
}: ReportThreadProps) {
  const { t } = useTranslation();
  const canComment = server.isReportOpen(report.status);

  let chatLog: string;
  let thread: React.ReactNode;
  if (details && !detailsFailed) {
    chatLog = details.chatLog;
    thread = details.comments.length === 0
      ? <span className="text-text-muted">{t('Reports.thread.noComments')}</span>
      : details.comments.map((c, i) => (
        <div key={i} className="mb-2" data-testid="report-comment">
          <div className="text-xs text-text-muted">
            [{formatReportTime(c.commentTime)}] {c.isModerator ? t('Reports.thread.moderatorPrefix') : reporterPrefix} {c.authorName}:
          </div>
          <div>{c.commentText}</div>
        </div>
      ));
  } else {
    const placeholder = detailsFailed ? t('Reports.thread.detailsFailed') : t('Reports.loading');
    chatLog = placeholder;
    thread = <span className="text-text-muted">{placeholder}</span>;
  }

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (canComment && !commentBusy && commentDraft.trim()) {
      onSendComment();
    }
  };

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className={PANEL_CLASS}>
        <span className={LABEL_CLASS}>{t('Reports.thread.description')}</span>
        <div className={`${BOX_CLASS} max-h-24`} data-testid="report-description">
          {report.description || <span className="text-text-muted">{t('Reports.thread.noDescription')}</span>}
        </div>
        {report.resolutionNote && (
          <div className="text-sm" data-testid="report-resolution">
            <span className="text-text-muted">{t('Reports.thread.resolution')}</span> {report.resolutionNote}
          </div>
        )}
      </div>

      <div className={PANEL_CLASS} title={t('Reports.thread.chatTooltip')}>
        <span className={LABEL_CLASS}>{t('Reports.thread.chatGroup')}</span>
        <div className={`${BOX_CLASS} max-h-32 font-mono text-xs`} data-testid="report-chat-log">
          {chatLog || <span className="text-text-muted">{t('Reports.thread.noChatLog')}</span>}
        </div>
      </div>

      <div className={PANEL_CLASS}>
        <span className={LABEL_CLASS}>{commentsTitle}</span>
        <div className={`${BOX_CLASS} max-h-48`} data-testid="report-thread">{thread}</div>
        <form className="flex gap-2" onSubmit={send}>
          <input
            aria-label={t('Reports.thread.addComment')}
            className={[
              'flex-1 bg-bg-base border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary',
              'focus:outline-none focus:border-accent disabled:opacity-50',
            ].join(' ')}
            placeholder={canComment ? openPlaceholder : t('Reports.thread.closedPlaceholder')}
            value={canComment ? commentDraft : ''}
            disabled={!canComment}
            onChange={(e) => onCommentDraftChange(e.target.value)}
          />
          <button
            type="submit"
            disabled={!canComment || commentBusy || !commentDraft.trim()}
            className={[
              'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white',
              'hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            <Send size={14} /> {t('Reports.thread.send')}
          </button>
        </form>
      </div>
    </div>
  );
}
