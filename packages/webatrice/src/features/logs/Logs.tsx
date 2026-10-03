import { Navigate } from 'react-router-dom';

import { AuthGuard } from '@app/components';
import { AlertDialog } from '@app/dialogs';
import { useUserCapabilities } from '@app/hooks';
import { RouteEnum } from '@app/types';

import LogResults from './LogResults';
import LogSearchForm from './LogSearchForm/LogSearchForm';
import { useLogs } from './useLogs';

import './Logs.css';

const Logs = () => {
  const { developer, logs, notice, dismissNotice, onSubmit } = useLogs();
  const { canReadLogs } = useUserCapabilities();

  return (
    <div className="moderator-logs scrollable">
      <AuthGuard />
      {!canReadLogs && <Navigate to={RouteEnum.SERVER} />}

      <div className="moderator-logs__form">
        <LogSearchForm onSubmit={onSubmit} developer={developer} />
      </div>

      <div className="moderator-logs__results">
        <LogResults logs={logs} />
      </div>

      <AlertDialog
        isOpen={notice !== null}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        severity={notice?.severity}
        onDismiss={dismissNotice}
      />
    </div>
  );
};

export default Logs;
