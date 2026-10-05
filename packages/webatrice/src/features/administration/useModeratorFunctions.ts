import type { AlertDialogNotice } from '@app/dialogs';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';

export interface ModeratorFunctions {
  grantReplayAccess: (replayId: number) => void;
  forceActivateUser: (userName: string) => void;
}

interface FailedPayload { command: string; responseCode: number; target: string; failure?: WebsocketTypes.CommandFailure }

/**
 * TabAdmin's "Server moderator functions" (tab_admin.cpp): grant yourself access
 * to a replay by id, and force-activate an account by user name. Both send the
 * local user as `moderator_name`, and report the outcome in a message box keyed
 * on the response code exactly as grantReplayAccessProcessResponse /
 * activateUserProcessResponse do; a request the server never answered gets the
 * transport reason instead.
 */
export function useModeratorFunctions(notify: (notice: AlertDialogNotice) => void): ModeratorFunctions {
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const webClient = useWebClient();
  const ownName = useAppSelector((state) => server.Selectors.getUser(state)?.name ?? '');
  // Only report outcomes of requests this page sent.
  const pendingReplays = useRef(new Set<string>());
  const pendingActivations = useRef(new Set<string>());

  const grantReplayAccess = useCallback((replayId: number) => {
    pendingReplays.current.add(String(replayId));
    webClient.request.moderator.grantReplayAccess(replayId, ownName);
  }, [webClient, ownName]);

  const forceActivateUser = useCallback((userName: string) => {
    const name = userName.trim();
    pendingActivations.current.add(name);
    webClient.request.moderator.forceActivateUser(name, ownName);
  }, [webClient, ownName]);

  const success = (message: string) => notify({ title: t('Administration.result.successTitle'), message, severity: 'info' });
  const failure = (message: string) => notify({ title: t('Administration.result.errorTitle'), message, severity: 'error' });

  useReduxEffect<{ replayId: number }>(({ payload }) => {
    if (pendingReplays.current.delete(String(payload.replayId))) {
      success(t('Administration.result.replayAccessGranted'));
      // Desktop fires an empty Event_ReplayAdded so the replays tab re-reads its list.
      webClient.request.session.replayList();
    }
  }, server.Types.GRANT_REPLAY_ACCESS, [t, webClient, notify]);

  useReduxEffect<{ usernameToActivate: string }>(({ payload }) => {
    if (pendingActivations.current.delete(payload.usernameToActivate)) {
      success(t('Administration.result.userActivated'));
    }
  }, server.Types.FORCE_ACTIVATE_USER, [t, notify]);

  useReduxEffect<FailedPayload>(({ payload }) => {
    if (payload.command === 'grantReplayAccess' && pendingReplays.current.delete(payload.target)) {
      failure(describeFailure(payload.failure, t(payload.responseCode === Response_ResponseCode.RespContextError
        ? 'Administration.result.replayIdInvalid'
        : 'Administration.result.replayAccessInternalError')));
    } else if (payload.command === 'forceActivateUser' && pendingActivations.current.delete(payload.target)) {
      const messages: Partial<Record<number, string>> = {
        [Response_ResponseCode.RespNameNotFound]: 'Administration.result.activateNameInvalid',
        [Response_ResponseCode.RespActivationFailed]: 'Administration.result.activateAlreadyActive',
      };
      failure(describeFailure(payload.failure, t(messages[payload.responseCode] ?? 'Administration.result.activateInternalError')));
    }
  }, server.Types.MODERATOR_COMMAND_FAILED, [describeFailure, t, notify]);

  return { grantReplayAccess, forceActivateUser };
}
