import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { UserMenuSlotProvider } from '@app/components';
import { AlertDialog, DialogShell } from '@app/dialogs';

import AdminNotesDialog from './AdminNotesDialog';
import BanUserDialog from './BanUserDialog';
import { BanHistoryDialog, WarnHistoryDialog } from './HistoryDialogs';
import ModerationMenuItems from './ModerationMenuItems';
import { BUTTON_SECONDARY_CLASS } from './moderationStyles';
import { ModerationContext, type ModerationApi } from './useModerationMenu';
import { useModerationFlow, type ModerationFlowState } from './useModerationFlow';
import WarnUserDialog from './WarnUserDialog';

const EMPTY_WARNINGS: string[] = [];

const LoadingDialog = ({ onCancel }: { onCancel: () => void }) => {
  const { t } = useTranslation();
  return (
    <DialogShell isOpen handleClose={onCancel} title={t('Moderation.common.loading')}>
      <div className="flex justify-end">
        <button type="button" className={BUTTON_SECONDARY_CLASS} onClick={onCancel}>{t('Moderation.common.cancel')}</button>
      </div>
    </DialogShell>
  );
};

export const ModerationDialogs = ({
  flow,
  notice,
  userInfo,
  warnList,
  banHistory,
  warnHistory,
  adminNotes,
  close,
  dismissNotice,
  submitWarn,
  submitBan,
  submitAdminNotes,
}: ModerationFlowState) => {
  let dialog: ReactNode = null;
  if (flow?.stage === 'loading') {
    dialog = <LoadingDialog onCancel={close} />;
  } else if (flow?.kind === 'warnUser') {
    dialog = (
      <WarnUserDialog
        userName={flow.userName}
        warnings={warnList?.warning ?? EMPTY_WARNINGS}
        onSubmit={submitWarn}
        onCancel={close}
      />
    );
  } else if (flow?.kind === 'banUser' && userInfo) {
    dialog = <BanUserDialog userInfo={userInfo} onSubmit={submitBan} onCancel={close} />;
  } else if (flow?.kind === 'banHistory') {
    dialog = <BanHistoryDialog userName={flow.userName} bans={banHistory ?? []} onClose={close} />;
  } else if (flow?.kind === 'warnHistory') {
    dialog = <WarnHistoryDialog userName={flow.userName} warnings={warnHistory ?? []} onClose={close} />;
  } else if (flow?.kind === 'adminNotes') {
    dialog = <AdminNotesDialog userName={flow.userName} notes={adminNotes ?? ''} onSubmit={submitAdminNotes} onCancel={close} />;
  }

  return (
    <>
      {dialog}
      <AlertDialog
        isOpen={notice !== null}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        severity={notice?.severity}
        onDismiss={dismissNotice}
      />
    </>
  );
};

/**
 * Hosts the moderator/admin user actions for the whole app. Mount once above
 * the routes: it registers the menu entries in `UserActionsMenu`'s slot, gives
 * `useModerationMenu` callers (game player list, player page) their `open`, and
 * renders the one dialog or message box the current round trip needs.
 */
export const ModerationProvider = ({ children }: { children: ReactNode }) => {
  const state = useModerationFlow();
  const { open } = state;
  const api = useMemo<ModerationApi>(() => ({ open }), [open]);

  return (
    <ModerationContext.Provider value={api}>
      <UserMenuSlotProvider value={ModerationMenuItems}>
        {children}
      </UserMenuSlotProvider>
      <ModerationDialogs {...state} />
    </ModerationContext.Provider>
  );
};
