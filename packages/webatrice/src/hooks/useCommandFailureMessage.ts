import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

const FAILURE_KEYS: Record<WebsocketTypes.CommandFailure, string> = {
  [WebsocketTypes.CommandFailure.NotSent]: 'CommandFailure.notSent',
  [WebsocketTypes.CommandFailure.Timeout]: 'CommandFailure.timeout',
  [WebsocketTypes.CommandFailure.Disconnected]: 'CommandFailure.disconnected',
};

/**
 * Explains why a server command failed, for the error surface of the flow
 * that sent it. A transport failure (no server answer) gets the matching
 * generic reason; a server rejection (`failure` undefined) gets the flow's
 * own message, normally desktop's text for that command.
 */
export function useCommandFailureMessage(): (
  failure: WebsocketTypes.CommandFailure | undefined,
  serverRejection: string,
) => string {
  const { t } = useTranslation();
  return useCallback(
    (failure, serverRejection) => (failure ? t(FAILURE_KEYS[failure]) : serverRejection),
    [t],
  );
}
