import { memo, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { ServerInfo_User } from '@cockatrice/sockatrice/generated';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';

/**
 * The User details modal behind the player-list context menu (see
 * `PlayerListContextMenu.tsx`). The menu's moderator dialogs (warn, ban,
 * histories, admin notes) live in the moderation feature-widget.
 *
 * ESC-cancelable and click-outside-cancelable via `ModalShell`.
 */

// ---------------------------------------------------------------------
// Shared modal shell (portal + backdrop + ESC handler).
// ---------------------------------------------------------------------

const MODAL_BUTTON_PRIMARY =
  'px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white '
  + 'hover:bg-accent-hover shadow-glow board-motion transition-colors '
  + 'disabled:opacity-50 disabled:cursor-not-allowed';

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onCancel: () => void;
  ariaLabel?: string;
  children: ReactNode;
  maxWidthClass?: string;
}

function ModalShell({
  title,
  subtitle,
  onCancel,
  ariaLabel,
  children,
  maxWidthClass = 'max-w-md',
}: ModalShellProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div
        className={
          'relative w-full rounded-lg bg-bg-surface border border-border-subtle '
          + 'shadow-glow overflow-hidden ' + maxWidthClass
        }
      >
        <div className="px-4 py-3 border-b border-border-subtle">
          <h2 className="font-modern text-base font-semibold text-text-primary">{title}</h2>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function InPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

// ---------------------------------------------------------------------
// User details — mirrors Cockatrice's `UserInfoBox` (user_info_box.cpp).
// Read-only view of the target's ServerInfo_User. Level flags rendered
// as chips; avatar preferred from the profile URL when present (fancy
// carries profile metadata alongside the wire's ServerInfo_User; both
// paths render the same avatar column).
// ---------------------------------------------------------------------

function levelFlagLabels(userLevel: number): string[] {
  const labels: string[] = [];
  if ((userLevel & ServerInfo_User_UserLevelFlag.IsAdmin) === ServerInfo_User_UserLevelFlag.IsAdmin) {
    labels.push('Admin');
  }
  if ((userLevel & ServerInfo_User_UserLevelFlag.IsModerator) === ServerInfo_User_UserLevelFlag.IsModerator) {
    labels.push('Moderator');
  }
  if ((userLevel & ServerInfo_User_UserLevelFlag.IsJudge) === ServerInfo_User_UserLevelFlag.IsJudge) {
    labels.push('Judge');
  }
  if ((userLevel & ServerInfo_User_UserLevelFlag.IsRegistered) === ServerInfo_User_UserLevelFlag.IsRegistered) {
    labels.push('Registered');
  }
  if (labels.length === 0) {
    labels.push('Unregistered');
  }
  return labels;
}

function accountAgeString(seconds: bigint): string {
  if (seconds <= 0n) {
    return '—';
  }
  const days = Number(seconds / 86_400n);
  if (days < 1) {
    return 'less than a day';
  }
  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'}`;
}

export const UserDetailsModal = memo(function UserDetailsModal({
  user,
  onClose,
}: {
  user: ServerInfo_User;
  onClose: () => void;
}) {
  const flags = levelFlagLabels(user.userLevel);
  return (
    <InPortal>
      <ModalShell
        title={user.name || '(unknown user)'}
        subtitle={user.privlevel ? `Privilege level: ${user.privlevel}` : undefined}
        ariaLabel={`User details for ${user.name}`}
        onCancel={onClose}
      >
        <div className="px-4 py-3 flex flex-col gap-3">
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
                  <dt className="text-text-muted">Real name</dt>
                  <dd className="text-text-primary truncate">{user.realName}</dd>
                </>
              )}
              {user.country && (
                <>
                  <dt className="text-text-muted">Country</dt>
                  <dd className="text-text-primary uppercase">{user.country}</dd>
                </>
              )}
              <dt className="text-text-muted">Account age</dt>
              <dd className="text-text-primary">{accountAgeString(user.accountageSecs)}</dd>
            </dl>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 rounded-full text-[11px] bg-bg-elevated border border-border-subtle text-text-primary"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={MODAL_BUTTON_PRIMARY}>
              Close
            </button>
          </div>
        </div>
      </ModalShell>
    </InPortal>
  );
});
