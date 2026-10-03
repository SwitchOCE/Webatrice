import { useTranslation } from 'react-i18next';
import { NavLink, generatePath } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import { formatReportDate } from '../reportFormat';

interface ReportUserContextPanelProps {
  userName: string;
  failed: boolean;
}

const SECONDS_PER_DAY = 86_400;

/**
 * Desktop TabReport "Reported User Context": account age, report / ban / warn
 * totals, admin notes and earlier reports against the user
 * (Command_ReportUserInfo). The name links to the user's profile page, the
 * webclient's surface for the remaining moderator actions.
 */
export default function ReportUserContextPanel({ userName, failed }: ReportUserContextPanelProps) {
  const { t } = useTranslation();
  // Shared with the Moderation page, which investigates the same user through the same command.
  const info = useAppSelector((state) => server.Selectors.getUserInvestigation(state, userName)?.info);

  let age: string;
  if (failed) {
    age = t('Reports.userContext.loadFailed');
  } else if (!info) {
    age = t('Reports.loading');
  } else {
    const days = Math.floor((Date.now() / 1000 - Number(info.registrationTime)) / SECONDS_PER_DAY);
    age = t('Reports.userContext.ageValue', { days, date: formatReportDate(info.registrationTime) });
  }

  return (
    <section
      className="rounded-md border border-border-subtle p-3 text-sm"
      aria-label={t('Reports.userContext.title')}
      data-testid="report-user-context"
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t('Reports.userContext.title')}</h3>
      <dl className="grid grid-cols-[max-content_1fr_max-content_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-muted">{t('Reports.userContext.user')}</dt>
        <dd className="col-span-3">
          <NavLink className="text-accent hover:underline" to={generatePath(RouteEnum.PLAYER, { name: userName })}>
            {userName}
          </NavLink>
        </dd>
        <dt className="text-text-muted">{t('Reports.userContext.accountAge')}</dt>
        <dd>{age}</dd>
        <dt className="text-text-muted">{t('Reports.userContext.reports')}</dt>
        <dd>{info?.totalReports ?? ''}</dd>
        <dt className="text-text-muted">{t('Reports.userContext.bans')}</dt>
        <dd>{info?.totalBans ?? ''}</dd>
        <dt className="text-text-muted">{t('Reports.userContext.warns')}</dt>
        <dd>{info?.totalWarns ?? ''}</dd>
      </dl>
      {info && (
        <>
          <div className="mt-2 text-text-muted">{t('Reports.userContext.adminNotes')}</div>
          <div className="whitespace-pre-wrap break-words">{info.adminNotes || t('Reports.userContext.none')}</div>
          <div className="mt-2 text-text-muted">{t('Reports.userContext.recentReports')}</div>
          {info.recentReports.length === 0 ? (
            <div>{t('Reports.userContext.noRecent')}</div>
          ) : (
            <ul className="max-h-28 overflow-y-auto font-mono text-xs">
              {info.recentReports.map((r) => (
                <li key={r.reportId}>
                  [{formatReportDate(r.reportTime)}] #{r.reportId} by {r.reporterName} [{r.status}]: {r.category}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
