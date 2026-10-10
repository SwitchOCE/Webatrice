import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ServerInfo_User } from '@cockatrice/sockatrice/generated';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import { DialogShell } from '@app/dialogs';
import { formatAccountAge } from '@app/utils';

const MODAL_BUTTON_PRIMARY =
  'px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white '
  + 'hover:bg-accent-hover shadow-glow board-motion transition-colors '
  + 'disabled:opacity-50 disabled:cursor-not-allowed';

// ---------------------------------------------------------------------
// User details — mirrors Cockatrice's `UserInfoBox` (user_info_box.cpp).
// Read-only view of the target's ServerInfo_User. Level flags rendered
// as chips; avatar preferred from the profile URL when present (fancy
// carries profile metadata alongside the wire's ServerInfo_User; both
// paths render the same avatar column).
// ---------------------------------------------------------------------

type LevelFlag = 'admin' | 'moderator' | 'judge' | 'registered' | 'unregistered';

function levelFlags(userLevel: number): LevelFlag[] {
  const flags: LevelFlag[] = [];
  const has = (flag: ServerInfo_User_UserLevelFlag) => (userLevel & flag) === flag;
  if (has(ServerInfo_User_UserLevelFlag.IsAdmin)) {
    flags.push('admin');
  }
  if (has(ServerInfo_User_UserLevelFlag.IsModerator)) {
    flags.push('moderator');
  }
  if (has(ServerInfo_User_UserLevelFlag.IsJudge)) {
    flags.push('judge');
  }
  if (has(ServerInfo_User_UserLevelFlag.IsRegistered)) {
    flags.push('registered');
  }
  if (flags.length === 0) {
    flags.push('unregistered');
  }
  return flags;
}

export const UserDetailsModal = memo(function UserDetailsModal({
  user,
  onClose,
}: {
  user: ServerInfo_User;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const flags = levelFlags(user.userLevel);
  return (
    <DialogShell
      isOpen
      handleClose={onClose}
      title={user.name || t('PlayerListDialogs.unknownUser')}
      description={user.privlevel ? t('PlayerListDialogs.privilegeLevel', { level: user.privlevel }) : undefined}
      footer={(
        <button type="button" onClick={onClose} className={MODAL_BUTTON_PRIMARY} data-autofocus>
          {t('PlayerListDialogs.close')}
        </button>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[80px,1fr] gap-3 items-start">
          <div
            className={
              'h-20 w-20 rounded-md bg-gradient-to-br from-accent-secondary '
              + 'to-accent flex items-center justify-center text-white text-2xl '
              + 'font-modern font-bold shrink-0'
            }
            aria-hidden
          >
            {(user.name || '?').slice(0, 1).toUpperCase()}
          </div>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm min-w-0">
            {user.realName && (
              <>
                <dt className="text-text-muted">{t('PlayerListDialogs.realName')}</dt>
                <dd className="text-text-primary truncate">{user.realName}</dd>
              </>
            )}
            {user.country && (
              <>
                <dt className="text-text-muted">{t('PlayerListDialogs.country')}</dt>
                <dd className="text-text-primary uppercase">{user.country}</dd>
              </>
            )}
            <dt className="text-text-muted">{t('PlayerListDialogs.accountAge')}</dt>
            <dd className="text-text-primary">{formatAccountAge(t, user.accountageSecs, user.userLevel, i18n.language)}</dd>
          </dl>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label={t('PlayerListDialogs.userLevel')}>
          {flags.map((flag) => (
            <li
              key={flag}
              className="px-2 py-0.5 rounded-full text-[11px] bg-bg-elevated border border-border-subtle text-text-primary"
            >
              {t(`PlayerListDialogs.level.${flag}`)}
            </li>
          ))}
        </ul>
      </div>
    </DialogShell>
  );
});
