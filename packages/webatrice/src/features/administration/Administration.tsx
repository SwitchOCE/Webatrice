import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';

import { AuthGuard, ModGuard } from '@app/components';
import { AlertDialog } from '@app/dialogs';
import { Layout } from '@app/feature-wrappers/layout';

import {
  buildActivateUserSchema,
  buildGrantReplaySchema,
  type ActivateUserFormValues,
  type GrantReplayFormValues,
} from './administrationSchemas';
import ShutdownDialog from './ShutdownDialog';
import { useAdministration } from './useAdministration';

import './Administration.css';

interface SingleFieldFormProps {
  disabled: boolean;
  onSubmit: (value: string) => void;
}

// Desktop: "Replay ID" line edit with QIntValidator(0, INT_MAX), so only digits go in;
// the button enables once it has text.
const GrantReplayForm = ({ disabled, onSubmit }: SingleFieldFormProps) => {
  const { t } = useTranslation();
  const resolver = useMemo(() => zodResolver(buildGrantReplaySchema(t)), [t]);
  const { control, handleSubmit, watch } = useForm<GrantReplayFormValues>({ defaultValues: { replayId: '' }, resolver });
  const empty = watch('replayId').trim() === '';

  return (
    <form className="administration__row" onSubmit={handleSubmit(({ replayId }) => onSubmit(replayId))} noValidate>
      <Controller
        name="replayId"
        control={control}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
            size="small"
            disabled={disabled}
            placeholder={t('Administration.moderator.replayId')}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message}
            slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': t('Administration.moderator.replayId') } }}
          />
        )}
      />
      <Button type="submit" variant="contained" disabled={disabled || empty}>
        {t('Administration.moderator.grantReplayAccess')}
      </Button>
    </form>
  );
};

const ActivateUserForm = ({ disabled, onSubmit }: SingleFieldFormProps) => {
  const { t } = useTranslation();
  const resolver = useMemo(() => zodResolver(buildActivateUserSchema(t)), [t]);
  const { control, handleSubmit, watch } = useForm<ActivateUserFormValues>({ defaultValues: { userName: '' }, resolver });
  const empty = watch('userName') === '';

  return (
    <form className="administration__row" onSubmit={handleSubmit(({ userName }) => onSubmit(userName))} noValidate>
      <Controller
        name="userName"
        control={control}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            size="small"
            disabled={disabled}
            placeholder={t('Administration.moderator.userToActivate')}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message}
            slotProps={{ htmlInput: { 'aria-label': t('Administration.moderator.userToActivate') } }}
          />
        )}
      />
      <Button type="submit" variant="contained" disabled={disabled || empty}>
        {t('Administration.moderator.forceActivateUser')}
      </Button>
    </form>
  );
};

/** Desktop TabAdmin (tab_admin.cpp). */
const AdministrationContent = () => {
  const { t } = useTranslation();
  const admin = useAdministration();

  return (
    <>
      <Paper component="section" className="administration__group" aria-labelledby="administration-admin-title">
        <h2 id="administration-admin-title" className="administration__title">{t('Administration.admin.title')}</h2>
        <div className="administration__buttons">
          <Button variant="contained" disabled={!admin.adminFunctionsEnabled} onClick={admin.updateServerMessage}>
            {t('Administration.admin.updateServerMessage')}
          </Button>
          <Button variant="contained" disabled={!admin.adminFunctionsEnabled} onClick={admin.openShutdownDialog}>
            {t('Administration.admin.shutdownServer')}
          </Button>
          <Button variant="contained" disabled={!admin.adminFunctionsEnabled} onClick={admin.reloadConfig}>
            {t('Administration.admin.reloadConfig')}
          </Button>
        </div>
      </Paper>

      <Paper component="section" className="administration__group" aria-labelledby="administration-moderator-title">
        <h2 id="administration-moderator-title" className="administration__title">{t('Administration.moderator.title')}</h2>
        <GrantReplayForm
          disabled={!admin.moderatorFunctionsEnabled}
          onSubmit={(replayId) => admin.grantReplayAccess(Number(replayId))}
        />
        <ActivateUserForm disabled={!admin.moderatorFunctionsEnabled} onSubmit={admin.forceActivateUser} />
      </Paper>

      <div className="administration__lock">
        <Button variant="outlined" disabled={!admin.locked} onClick={admin.unlock}>
          {t('Administration.button.unlock')}
        </Button>
        <Button variant="outlined" disabled={admin.locked} onClick={admin.lock}>
          {t('Administration.button.lock')}
        </Button>
      </div>

      <ShutdownDialog
        isOpen={admin.shutdownDialogOpen}
        onSubmit={admin.shutdownServer}
        onCancel={admin.closeShutdownDialog}
      />
      <AlertDialog
        isOpen={admin.notice !== null}
        title={admin.notice?.title ?? ''}
        message={admin.notice?.message ?? ''}
        severity={admin.notice?.severity ?? 'info'}
        buttonLabel={t('Administration.button.ok')}
        onDismiss={admin.dismissNotice}
      />
    </>
  );
};

// The guards mount the page body only when it is allowed, so its mount effects
// never send a staff or 3.1 command the user or server cannot serve.
const Administration = () => (
  <Layout className="administration scrollable">
    <AuthGuard />
    <ModGuard>
      <AdministrationContent />
    </ModGuard>
  </Layout>
);

export default Administration;
