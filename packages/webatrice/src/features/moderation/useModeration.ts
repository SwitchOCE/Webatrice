import type { AlertDialogNotice } from '@app/dialogs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import {
  INVESTIGATE_USER_PARAM,
  useCommandFailureMessage,
  useReduxEffect,
  userInvestigationPath,
  type ReduxEffectAction,
} from '@app/hooks';
import { server, type UserInvestigation } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { Response_ReportUserInfo, ServerInfo_ModeratorLogin } from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { useAppDispatch, useAppSelector } from '@app/store';

export type InvestigationPart = 'info' | 'alts' | 'sessions';

type PartFlags = Record<InvestigationPart, boolean>;

const NONE: PartFlags = { info: false, alts: false, sessions: false };
const ALL: PartFlags = { info: true, alts: true, sessions: true };

export type ModerationConfirm = 'resetPassword' | 'removeAvatar';

/** A reset's temporary password: shown once, held only here, dropped on dismiss. */
export interface TemporaryPassword {
  userName: string;
  temporaryPassword: string;
}

export interface Moderation {
  currentUser: string;
  investigate: (userName: string) => void;
  /** The current user's lookups; a part is withheld while pending or after a failure, as desktop clears its table. */
  investigation: UserInvestigation;
  pending: PartFlags;
  failed: PartFlags;
  /** Why the user-info lookup failed (desktop text, or the transport reason). */
  infoError: string | null;
  staffLogins: ServerInfo_ModeratorLogin[] | null;
  refreshStaffLogins: () => void;
  canResetPassword: boolean;
  confirm: ModerationConfirm | null;
  requestConfirm: (action: ModerationConfirm) => void;
  cancelConfirm: () => void;
  confirmAction: () => void;
  temporaryPassword: TemporaryPassword | null;
  dismissTemporaryPassword: () => void;
  notice: AlertDialogNotice | null;
  dismissNotice: () => void;
}

/** Desktop `QString::simplified()`: trim and collapse inner whitespace. */
const simplified = (value: string): string => value.replace(/\s+/g, ' ').trim();

interface FailedPayload { command: WebsocketTypes.ModeratorCommandName; target: string; failure?: WebsocketTypes.CommandFailure }

const LOOKUP_PARTS: Partial<Record<WebsocketTypes.ModeratorCommandName, InvestigationPart>> = {
  reportUserInfo: 'info',
  getUserAlts: 'alts',
  getUserSessions: 'sessions',
};

/**
 * Desktop TabModeration: investigate a user (ReportUserInfo, GetUserSessions,
 * GetUserAlts), list staff last logins, reset a password, remove an avatar.
 * The investigated user follows the `?user=` query parameter, so
 * `useOpenUserInvestigation` from anywhere switches an open page to a new user.
 */
export function useModeration(): Moderation {
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const webClient = useWebClient();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedUser = simplified(searchParams.get(INVESTIGATE_USER_PARAM) ?? '');

  const isAdmin = useAppSelector(server.Selectors.getIsUserAdmin);
  const storedLogins = useAppSelector(server.Selectors.getModeratorLastLogins);

  const [currentUser, setCurrentUser] = useState('');
  const currentUserRef = useRef('');
  const [pending, setPending] = useState<PartFlags>(NONE);
  const [failed, setFailed] = useState<PartFlags>(NONE);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [staffFailed, setStaffFailed] = useState(false);
  const [confirm, setConfirm] = useState<ModerationConfirm | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<TemporaryPassword | null>(null);
  const [notice, setNotice] = useState<AlertDialogNotice | null>(null);
  // Avatar removals this page sent, so another page's outcomes are not reported here.
  const pendingAvatarRemovals = useRef(new Set<string>());

  const stored = useAppSelector((state) => server.Selectors.getUserInvestigation(state, currentUser));

  const settle = useCallback((part: InvestigationPart, userName: string, ok: boolean) => {
    if (userName !== currentUserRef.current) {
      return;
    }
    setPending((p) => ({ ...p, [part]: false }));
    if (!ok) {
      setFailed((f) => ({ ...f, [part]: true }));
    }
  }, []);

  useReduxEffect((action: ReduxEffectAction<{ info: Response_ReportUserInfo }>) => {
    settle('info', action.payload.info.userName, true);
  }, server.Types.USER_INFO_REPORT, [settle]);
  useReduxEffect((action: ReduxEffectAction<{ userName: string }>) => {
    settle('alts', action.payload.userName, true);
  }, server.Types.USER_ALTS, [settle]);
  useReduxEffect((action: ReduxEffectAction<{ userName: string }>) => {
    settle('sessions', action.payload.userName, true);
  }, server.Types.USER_SESSIONS, [settle]);

  const errorNotice = useCallback((message: string) => {
    setNotice({ title: t('ModerationPage.notice.errorTitle'), message, severity: 'error' });
  }, [t]);

  useReduxEffect((action: ReduxEffectAction<{ userName: string }>) => {
    const { userName } = action.payload;
    if (pendingAvatarRemovals.current.delete(userName.toLowerCase())) {
      setNotice({
        title: t('ModerationPage.notice.avatarRemovedTitle'),
        message: t('ModerationPage.notice.avatarRemoved', { userName }),
        severity: 'info',
      });
    }
  }, server.Types.USER_AVATAR_REMOVED, [t]);

  // One failure path for every staff lookup (#12's commandFailed): desktop clears
  // the table, and the user-info box says why.
  useReduxEffect((action: ReduxEffectAction<FailedPayload>) => {
    const { command, target, failure } = action.payload;
    const part = LOOKUP_PARTS[command];
    if (part) {
      if (part === 'info' && target === currentUserRef.current) {
        setInfoError(describeFailure(failure, t('ModerationPage.info.loadError')));
      }
      settle(part, target, false);
    } else if (command === 'getModeratorLastLogins') {
      setStaffFailed(true);
    } else if (command === 'removeUserAvatar' && pendingAvatarRemovals.current.delete(target.toLowerCase())) {
      errorNotice(describeFailure(failure, t('ModerationPage.notice.avatarFailed')));
    }
  }, server.Types.MODERATOR_COMMAND_FAILED, [settle, describeFailure, errorNotice, t]);

  const runInvestigation = useCallback((userName: string) => {
    currentUserRef.current = userName;
    dispatch(server.Actions.userInvestigationStarted({ userName }));
    setCurrentUser(userName);
    setPending(ALL);
    setFailed(NONE);
    setInfoError(null);
    const moderator = webClient.request.moderator;
    moderator.reportUserInfo(userName);
    moderator.getUserSessions(userName);
    moderator.getUserAlts(userName);
  }, [dispatch, webClient]);

  const refreshStaffLogins = useCallback(() => {
    setStaffFailed(false);
    webClient.request.moderator.getModeratorLastLogins();
  }, [webClient]);

  // Desktop requests the staff list once when the tab opens.
  useEffect(() => {
    refreshStaffLogins();
  }, [refreshStaffLogins]);

  // Every navigation here naming a user (the search box, or "investigate" from
  // elsewhere) runs a fresh investigation, as TabSupervisor::openTabModeration does.
  useEffect(() => {
    if (requestedUser) {
      runInvestigation(requestedUser);
    }
  }, [requestedUser, location.key, runInvestigation]);

  const investigate = (userName: string) => {
    const name = simplified(userName);
    if (name) {
      navigate(userInvestigationPath(name), { replace: true });
    }
  };

  const shown = (part: InvestigationPart) => !pending[part] && !failed[part];
  const investigation: UserInvestigation = {
    info: shown('info') ? stored?.info : undefined,
    alts: shown('alts') ? stored?.alts : undefined,
    sessions: shown('sessions') ? stored?.sessions : undefined,
  };

  const resetPassword = (userName: string) => {
    webClient.request.admin.resetUserPassword(
      userName,
      (resetName, password) => setTemporaryPassword({ userName: resetName, temporaryPassword: password }),
      (_responseCode, failure) => errorNotice(describeFailure(failure, t('ModerationPage.notice.resetFailed'))),
    );
  };

  const removeAvatar = (userName: string) => {
    // Servatrice may echo the canonical spelling of the name, so match case-insensitively.
    pendingAvatarRemovals.current.add(userName.toLowerCase());
    webClient.request.moderator.removeUserAvatar(userName);
  };

  const confirmAction = () => {
    const action = confirm;
    setConfirm(null);
    if (!currentUser) {
      return;
    }
    if (action === 'resetPassword') {
      resetPassword(currentUser);
    } else if (action === 'removeAvatar') {
      removeAvatar(currentUser);
    }
  };

  return {
    currentUser,
    investigate,
    investigation,
    pending,
    failed,
    infoError,
    staffLogins: staffFailed ? null : storedLogins,
    refreshStaffLogins,
    // Servatrice serves ResetUserPassword only through the admin command family.
    canResetPassword: isAdmin,
    confirm,
    requestConfirm: setConfirm,
    cancelConfirm: () => setConfirm(null),
    confirmAction,
    temporaryPassword,
    dismissTemporaryPassword: () => setTemporaryPassword(null),
    notice,
    dismissNotice: () => setNotice(null),
  };
}
