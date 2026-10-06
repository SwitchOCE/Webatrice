import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebClient } from '@cockatrice/datatrice/react';
import { server, normalizeLogs, type ServerStateLogs } from '@cockatrice/datatrice';
import type { ServerInfo_ChatMessage, ViewLogHistoryParams } from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { useCommandFailureMessage, useReduxEffect, useRequestTracker } from '@app/hooks';
import { useAppDispatch, useAppSelector } from '@app/store';

import { logDateRangeHours, type LogSearchFormValues } from './LogSearchForm/logSearchFormSchema';

export interface LogsNotice {
  title: string;
  message: string;
  severity: 'info' | 'error';
}

export interface Logs {
  logs: ServerStateLogs;
  notice: LogsNotice | null;
  dismissNotice: () => void;
  onSubmit: (values: LogSearchFormValues) => void;
}

const LOG_LOCATIONS = ['room', 'game', 'chat'] as const;

/**
 * Builds Command_ViewLogHistory from a completed search the way
 * TabLog::getClicked does: blank text filters are left out, the selected
 * locations become `log_location`, the range becomes `date_range` in hours.
 */
export function toViewLogHistoryParams(values: LogSearchFormValues): ViewLogHistoryParams {
  const text = (value: string) => value.trim() || undefined;
  return {
    $typeName: 'Command_ViewLogHistory.Params',
    userName: text(values.userName),
    ipAddress: text(values.ipAddress),
    gameName: text(values.gameName),
    gameId: text(values.gameId),
    message: text(values.message),
    logLocation: LOG_LOCATIONS.filter((location) => values.logLocation[location]),
    dateRange: logDateRangeHours(values),
    maximumResults: values.maximumResults,
  } as ViewLogHistoryParams;
}

export function useLogs(): Logs {
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const dispatch = useAppDispatch();
  const storedLogs = useAppSelector(server.Selectors.getLogs);
  // Only owned replies replace this page's rows; unrelated actions may still update the shared cache.
  const [logs, setLogs] = useState(() => storedLogs);
  const webClient = useWebClient();
  const [notices, setNotices] = useState<LogsNotice[]>([]);
  const requests = useRequestTracker();

  useEffect(() => {
    return () => {
      dispatch(server.Actions.clearLogs());
    };
  }, [dispatch]);

  // TabLog::viewLogHistory_processResponse: an empty result is a message box,
  // not an empty table.
  useReduxEffect<{ logs: ServerInfo_ChatMessage[]; requestId?: string }>(({ payload }) => {
    if (!requests.settle(payload.requestId)) {
      return;
    }
    setLogs(normalizeLogs(payload.logs));
    if (payload.logs.length === 0) {
      setNotices((queue) => [...queue, { title: t('Logs.notice.title'), message: t('Logs.notice.empty'), severity: 'info' }]);
    }
  }, server.Types.VIEW_LOGS, [requests, t]);

  // A transport failure (timeout, lost connection) explains itself; a server
  // rejection gets desktop's message.
  useReduxEffect<{ command: string; failure?: WebsocketTypes.CommandFailure; requestId?: string }>(({ payload }) => {
    if (payload.command !== 'viewLogHistory' || !requests.settle(payload.requestId)) {
      return;
    }
    setNotices((queue) => [...queue, {
      title: t('Logs.notice.title'),
      message: describeFailure(payload.failure, t('Logs.notice.failed')),
      severity: 'error',
    }]);
  }, server.Types.MODERATOR_COMMAND_FAILED, [describeFailure, requests, t]);

  const onSubmit = useCallback((values: LogSearchFormValues) => {
    const requestId = requests.begin();
    requests.track(requestId);
    webClient.request.moderator.viewLogHistory(toViewLogHistoryParams(values), requestId);
  }, [requests, webClient]);

  const dismissNotice = useCallback(() => setNotices((queue) => queue.slice(1)), []);

  return { logs, notice: notices[0] ?? null, dismissNotice, onSubmit };
}
