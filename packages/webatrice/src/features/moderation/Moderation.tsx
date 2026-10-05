import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';

import { AuthGuard, CapabilityGuard, ModGuard } from '@app/components';
import { AlertDialog, ConfirmDialog } from '@app/dialogs';
import { Layout } from '@app/feature-wrappers/layout';
import { ServerCapability } from '@cockatrice/datatrice';

import { formatEpoch, formatStaffLevel } from './moderationFormat';
import StaffTable from './StaffTable';
import TemporaryPasswordDialog from './TemporaryPasswordDialog';
import UserInfoPanel from './UserInfoPanel';
import { useModeration } from './useModeration';

import './Moderation.css';

const searchSchema = z.object({ userName: z.string() });
type SearchFormValues = z.infer<typeof searchSchema>;

/** Desktop TabModeration (tab_moderation.cpp). */
const ModerationContent = () => {
  const { t } = useTranslation();
  const moderation = useModeration();
  const { currentUser, investigation, pending } = moderation;

  const resolver = useMemo(() => zodResolver(searchSchema), []);
  const { control, handleSubmit, setValue } = useForm<SearchFormValues>({ defaultValues: { userName: '' }, resolver });

  // The search box shows whoever is being investigated, as desktop's investigate() fills it.
  useEffect(() => {
    if (currentUser) {
      setValue('userName', currentUser);
    }
  }, [currentUser, setValue]);

  const altsColumns = [
    t('ModerationPage.alts.user'), t('ModerationPage.alts.email'), t('ModerationPage.alts.clientId'), t('ModerationPage.alts.registered'),
    t('ModerationPage.alts.lastLogin'), t('ModerationPage.alts.warns'), t('ModerationPage.alts.bans'), t('ModerationPage.alts.active'),
  ];
  const altsRows = (investigation.alts ?? []).map((alt) => ({
    key: alt.userName,
    cells: [
      alt.userName, alt.email, alt.clientid, formatEpoch(alt.registrationTime, t), formatEpoch(alt.lastLogin, t),
      String(alt.warnCount), String(alt.banCount), alt.isActive ? t('ModerationPage.value.yes') : t('ModerationPage.value.no'),
    ],
  }));

  const sessionsColumns = [
    t('ModerationPage.sessions.ip'), t('ModerationPage.sessions.clientId'), t('ModerationPage.sessions.start'),
    t('ModerationPage.sessions.end'), t('ModerationPage.sessions.type'),
  ];
  const sessionsRows = (investigation.sessions ?? []).map((session, index) => ({
    key: `${session.startTime}-${index}`,
    cells: [
      session.ipAddress, session.clientid, formatEpoch(session.startTime, t),
      Number(session.endTime) === 0 ? t('ModerationPage.value.activeSession') : formatEpoch(session.endTime, t),
      session.connectionType,
    ],
  }));

  const staffColumns = [t('ModerationPage.staff.user'), t('ModerationPage.staff.level'), t('ModerationPage.staff.lastLogin')];
  const staffRows = (moderation.staffLogins ?? []).map((login) => ({
    key: login.userName,
    cells: [login.userName, formatStaffLevel(login.userLevel, t), formatEpoch(login.lastLogin, t)],
  }));

  const confirmText = moderation.confirm === 'resetPassword'
    ? { title: t('ModerationPage.confirm.resetTitle'), message: t('ModerationPage.confirm.reset', { userName: currentUser }) }
    : { title: t('ModerationPage.confirm.avatarTitle'), message: t('ModerationPage.confirm.avatar', { userName: currentUser }) };

  return (
    <>
      <div className="moderation__top">
        <form
          className="moderation__search"
          role="search"
          onSubmit={handleSubmit(({ userName }) => moderation.investigate(userName))}
        >
          <Controller
            name="userName"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                size="small"
                type="search"
                placeholder={t('ModerationPage.search.placeholder')}
                slotProps={{ htmlInput: { 'aria-label': t('ModerationPage.search.placeholder') } }}
              />
            )}
          />
          <Button type="submit" variant="contained">{t('ModerationPage.search.investigate')}</Button>
        </form>
        <div className="moderation__actions">
          {moderation.canResetPassword && (
            <Button variant="outlined" disabled={!currentUser} onClick={() => moderation.requestConfirm('resetPassword')}>
              {t('ModerationPage.action.resetPassword')}
            </Button>
          )}
          <Button variant="outlined" disabled={!currentUser} onClick={() => moderation.requestConfirm('removeAvatar')}>
            {t('ModerationPage.action.removeAvatar')}
          </Button>
        </div>
      </div>

      <UserInfoPanel
        userName={currentUser}
        info={investigation.info}
        loading={pending.info}
        error={moderation.infoError}
      />

      <Paper component="section" className="moderation__group" aria-label={t('ModerationPage.alts.title')}>
        <h2 className="moderation__title">{t('ModerationPage.alts.title')}</h2>
        <StaffTable columns={altsColumns} rows={altsRows} loading={Boolean(currentUser) && pending.alts} />
      </Paper>

      <Paper component="section" className="moderation__group" aria-label={t('ModerationPage.sessions.title')}>
        <h2 className="moderation__title">{t('ModerationPage.sessions.title')}</h2>
        <StaffTable columns={sessionsColumns} rows={sessionsRows} loading={Boolean(currentUser) && pending.sessions} />
      </Paper>

      <Paper component="section" className="moderation__group" aria-label={t('ModerationPage.staff.title')}>
        <h2 className="moderation__title">{t('ModerationPage.staff.title')}</h2>
        <StaffTable columns={staffColumns} rows={staffRows} />
        <div className="moderation__refresh">
          <Button size="small" onClick={moderation.refreshStaffLogins}>{t('ModerationPage.staff.refresh')}</Button>
        </div>
      </Paper>

      <ConfirmDialog
        isOpen={moderation.confirm !== null}
        title={confirmText.title}
        message={confirmText.message}
        confirmLabel={t('ModerationPage.button.ok')}
        cancelLabel={t('ModerationPage.button.cancel')}
        destructive
        cancelDefault
        onConfirm={moderation.confirmAction}
        onCancel={moderation.cancelConfirm}
      />
      <TemporaryPasswordDialog result={moderation.temporaryPassword} onDismiss={moderation.dismissTemporaryPassword} />
      <AlertDialog
        isOpen={moderation.notice !== null}
        title={moderation.notice?.title ?? ''}
        message={moderation.notice?.message ?? ''}
        severity={moderation.notice?.severity ?? 'info'}
        buttonLabel={t('ModerationPage.button.ok')}
        onDismiss={moderation.dismissNotice}
      />
    </>
  );
};

// The guards mount the page body only when it is allowed, so its mount effects
// never send a staff or 3.1 command the user or server cannot serve.
const Moderation = () => (
  <Layout className="moderation scrollable">
    <AuthGuard />
    <ModGuard>
      <CapabilityGuard capability={ServerCapability.MODERATION_TOOLS}>
        <ModerationContent />
      </CapabilityGuard>
    </ModGuard>
  </Layout>
);

export default Moderation;
