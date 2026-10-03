import { AuthGuard, ModGuard } from '@app/components';
import { AlertDialog } from '@app/dialogs';
import { ModeratorFunctions } from '@app/feature-widgets/moderation';

import LogResults from './LogResults';
import LogSearchForm from './LogSearchForm/LogSearchForm';
import { useLogs } from './useLogs';

import './Logs.css';

const Logs = () => {
  const { logs, notice, dismissNotice, onSubmit } = useLogs();

  return (
    <div className="moderator-logs scrollable">
      <AuthGuard />
      <ModGuard />

      <div className="moderator-logs__form">
        <LogSearchForm onSubmit={onSubmit} />
        {/* Desktop keeps these on its Administration tab, which Webatrice
         *  does not have yet; the moderator-only Logs page hosts them. */}
        <div className="moderator-logs__functions">
          <ModeratorFunctions />
        </div>
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
