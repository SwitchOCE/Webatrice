import { useTranslation } from 'react-i18next';

import Paper from '@mui/material/Paper';

import type { Response_ReportUserInfo } from '@cockatrice/sockatrice/generated';

import { formatEpoch } from './moderationFormat';

interface UserInfoPanelProps {
  userName: string;
  info: Response_ReportUserInfo | undefined;
  loading: boolean;
  error: string | null;
}

const UserInfoPanel = ({ userName, info, loading, error }: UserInfoPanelProps) => {
  const { t } = useTranslation();
  const loadingText = loading ? t('ModerationPage.value.loading') : '';

  const status = (): string => {
    if (error) {
      return error;
    }
    if (!info) {
      return '';
    }
    const parts = [info.isActive ? t('ModerationPage.info.active') : t('ModerationPage.info.inactive')];
    if (info.isAdmin) {
      parts.push(t('ModerationPage.info.admin'));
    }
    return parts.join(', ');
  };

  const fields: [string, string][] = [
    [t('ModerationPage.info.name'), userName],
    [t('ModerationPage.info.registered'), info ? formatEpoch(info.registrationTime, t) : loadingText],
    [t('ModerationPage.info.lastLogin'), info ? formatEpoch(info.lastLogin, t) : loadingText],
    [t('ModerationPage.info.status'), status()],
    [t('ModerationPage.info.counts'), info
      ? t('ModerationPage.info.countsValue', { reports: info.totalReports, bans: info.totalBans, warnings: info.totalWarns })
      : ''],
  ];

  return (
    <Paper component="section" className="moderation__group" aria-label={t('ModerationPage.info.title')}>
      <h2 className="moderation__title">{t('ModerationPage.info.title')}</h2>
      <dl className="moderation__info">
        {fields.map(([label, value]) => (
          <div key={label} className="moderation__info-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className="moderation__info-row moderation__info-row--notes">
          <dt>{t('ModerationPage.info.adminNotes')}</dt>
          <dd className="moderation__notes">
            {info ? (info.adminNotes || t('ModerationPage.info.noNotes')) : ''}
          </dd>
        </div>
      </dl>
    </Paper>
  );
};

export default UserInfoPanel;
