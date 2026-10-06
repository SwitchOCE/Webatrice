import { Navigate } from 'react-router-dom';

import { AuthGuard } from '@app/components';
import { AlertDialog } from '@app/dialogs';
import { ModeratorFunctions } from '@app/feature-widgets/moderation';
import { useUserCapabilities } from '@app/hooks';
import { RouteEnum } from '@app/types';

import LogResults from './LogResults';
import LogSearchForm from './LogSearchForm/LogSearchForm';
import { useLogs } from './useLogs';

import './Logs.css';

const Logs = () => {
  const { developer, logs, notice, dismissNotice, onSubmit } = useLogs();
  const { isModerator, canReadLogs } = useUserCapabilities();

  return (
    <div className="moderator-logs scrollable">
      <AuthGuard />
      {!canReadLogs && <Navigate to={RouteEnum.SERVER} />}

      <div className="moderator-logs__form">
        <LogSearchForm onSubmit={onSubmit} developer={developer} />
        {/* Desktop keeps these on its Administration tab, which Webatrice
         *  does not have yet; the Logs page hosts them for moderators. */}
        {isModerator && (
          <div className="moderator-logs__functions">
            <ModeratorFunctions />
          </div>
        )}
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
