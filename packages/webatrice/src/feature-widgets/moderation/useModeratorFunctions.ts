import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';

import type { ModerationNotice } from './useModerationFlow';

export interface ModeratorFunctions {
  notice: ModerationNotice | null;
  dismissNotice: () => void;
  grantReplayAccess: (replayId: number) => void;
  forceActivateUser: (userName: string) => void;
}

interface FailedPayload { command: string; responseCode: number; target: string }

/**
 * TabAdmin's "Server moderator functions" (tab_admin.cpp): grant yourself access
 * to a replay by id, and force-activate an account by user name. Both send the
 * local user as `moderator_name`, and report the outcome in a message box keyed
 * on the response code exactly as grantReplayAccessProcessResponse /
 * activateUserProcessResponse do.
 */
export function useModeratorFunctions(): ModeratorFunctions {
  const { t } = useTranslation();
  const webClient = useWebClient();
  const ownName = useAppSelector((state) => server.Selectors.getUser(state)?.name ?? '');
  const [notice, setNotice] = useState<ModerationNotice | null>(null);
  // Only report outcomes of requests this panel sent.
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

  const dismissNotice = useCallback(() => setNotice(null), []);

  const success = (message: string) => setNotice({ title: t('Moderation.common.success'), message, severity: 'info' });
  const failure = (message: string) => setNotice({ title: t('Moderation.common.error'), message, severity: 'error' });

  useReduxEffect<{ replayId: number }>(({ payload }) => {
    if (pendingReplays.current.delete(String(payload.replayId))) {
      success(t('Moderation.functions.replayGranted'));
      // Desktop fires an empty Event_ReplayAdded so the replays tab re-reads its list.
      webClient.request.session.replayList();
    }
  }, server.Types.GRANT_REPLAY_ACCESS, [t, webClient]);

  useReduxEffect<{ usernameToActivate: string }>(({ payload }) => {
    if (pendingActivations.current.delete(payload.usernameToActivate)) {
      success(t('Moderation.functions.activated'));
    }
  }, server.Types.FORCE_ACTIVATE_USER, [t]);

  useReduxEffect<FailedPayload>(({ payload }) => {
    if (payload.command === 'grantReplayAccess' && pendingReplays.current.delete(payload.target)) {
      failure(t(payload.responseCode === Response_ResponseCode.RespContextError
        ? 'Moderation.functions.replayInvalid'
        : 'Moderation.functions.replayError'));
    } else if (payload.command === 'forceActivateUser' && pendingActivations.current.delete(payload.target)) {
      const messages: Partial<Record<number, string>> = {
        [Response_ResponseCode.RespNameNotFound]: 'Moderation.functions.activateUnknown',
        [Response_ResponseCode.RespActivationFailed]: 'Moderation.functions.activateAlreadyActive',
      };
      failure(t(messages[payload.responseCode] ?? 'Moderation.functions.activateError'));
    }
  }, server.Types.MODERATOR_COMMAND_FAILED, [t]);

  return { notice, dismissNotice, grantReplayAccess, forceActivateUser };
}
