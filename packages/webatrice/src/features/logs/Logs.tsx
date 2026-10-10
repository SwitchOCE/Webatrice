import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { AlertDialog } from '@app/dialogs';
import { StaffConsole, StaffHeader } from '@app/feature-wrappers/staff';
import { useUserCapabilities } from '@app/hooks';
import { RouteEnum } from '@app/types';

import LogResults from './LogResults';
import LogSearchForm from './LogSearchForm/LogSearchForm';
import { useLogs } from './useLogs';

const Logs = () => {
  const { t } = useTranslation();
  const { developer, logs, notice, dismissNotice, onSubmit } = useLogs();
  const { canReadLogs } = useUserCapabilities();

  return (
    <StaffConsole>
      {!canReadLogs && <Navigate to={RouteEnum.SERVER} />}
      <StaffHeader title={t('Logs.pageTitle')} subtitle={t('Logs.subtitle')} />
      <LogSearchForm onSubmit={onSubmit} developer={developer} />
      <LogResults logs={logs} />
      <AlertDialog
        isOpen={notice !== null}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        severity={notice?.severity}
        onDismiss={dismissNotice}
      />
    </StaffConsole>
  );
};

export default Logs;
