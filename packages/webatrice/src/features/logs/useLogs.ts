import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebClient } from '@cockatrice/datatrice/react';
import { server, type ServerStateLogs } from '@cockatrice/datatrice';
import type { ServerInfo_ChatMessage, ViewLogHistoryParams } from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { useAppDispatch, useAppSelector } from '@app/store';

import { logDateRangeHours, type LogSearchFormValues } from './LogSearchForm/logSearchFormSchema';

export interface LogsNotice {
  title: string;
  message: string;
  severity: 'info' | 'error';
}

export interface Logs {
  /** True for a developer without moderator rights: searches go through the developer family. */
  developer: boolean;
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
  const logs = useAppSelector((state) => server.Selectors.getLogs(state));
  const webClient = useWebClient();
  // Desktop TabSupervisor::openTabLog: the developer bit selects the narrowed developer family only
  // when the user is not also a moderator.
  const isModerator = useAppSelector(server.Selectors.getIsUserModerator);
  const developer = useAppSelector(server.Selectors.getIsUserDeveloper) && !isModerator;
  const [notice, setNotice] = useState<LogsNotice | null>(null);
  // Report outcomes only for searches sent from this page.
  const searching = useRef(false);

  useEffect(() => {
    return () => {
      dispatch(server.Actions.clearLogs());
    };
  }, [dispatch]);

  // TabLog::viewLogHistory_processResponse: an empty result is a message box,
  // not an empty table.
  useReduxEffect<{ logs: ServerInfo_ChatMessage[] }>(({ payload }) => {
    if (!searching.current) {
      return;
    }
    searching.current = false;
    if (payload.logs.length === 0) {
      setNotice({ title: t('Logs.notice.title'), message: t('Logs.notice.empty'), severity: 'info' });
    }
  }, server.Types.VIEW_LOGS, [t]);

  // A transport failure (timeout, lost connection) explains itself; a server
  // rejection gets desktop's message.
  useReduxEffect<{ command: string; failure?: WebsocketTypes.CommandFailure }>(({ payload }) => {
    if (payload.command !== 'viewLogHistory' || !searching.current) {
      return;
    }
    searching.current = false;
    setNotice({
      title: t('Logs.notice.title'),
      message: describeFailure(payload.failure, t('Logs.notice.failed')),
      severity: 'error',
    });
  }, server.Types.MODERATOR_COMMAND_FAILED, [describeFailure, t]);

  const onSubmit = useCallback((values: LogSearchFormValues) => {
    searching.current = true;
    if (developer) {
      webClient.request.developer.viewLogHistory(toViewLogHistoryParams(values));
    } else {
      webClient.request.moderator.viewLogHistory(toViewLogHistoryParams(values));
    }
  }, [webClient, developer]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { developer, logs, notice, dismissNotice, onSubmit };
}
