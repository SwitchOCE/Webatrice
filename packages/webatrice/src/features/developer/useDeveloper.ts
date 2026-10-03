import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { Response_GetServerStats } from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { useAppSelector } from '@app/store';

import { formatTimestamp } from './serverStatsRows';

// Desktop TabDeveloper: the interval spin box runs 5..3600 s, default 30.
export const MIN_REFRESH_INTERVAL_SECS = 5;
export const MAX_REFRESH_INTERVAL_SECS = 3600;
export const DEFAULT_REFRESH_INTERVAL_SECS = 30;

export interface Developer {
  stats: Response_GetServerStats | null;
  status: string;
  refresh: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (on: boolean) => void;
  intervalSecs: number;
  setIntervalSecs: (secs: number) => void;
}

const clampInterval = (secs: number): number =>
  Math.min(MAX_REFRESH_INTERVAL_SECS, Math.max(MIN_REFRESH_INTERVAL_SECS, Math.round(secs) || MIN_REFRESH_INTERVAL_SECS));

/**
 * Desktop TabDeveloper: server statistics on demand, with an optional
 * auto-refresh. Like desktop, nothing is requested until the user refreshes,
 * and a refresh is skipped while the previous request is still pending.
 */
export function useDeveloper(): Developer {
  const { t } = useTranslation();
  const webClient = useWebClient();
  const describeFailure = useCommandFailureMessage();
  const stats = useAppSelector(server.Selectors.getServerStats);
  const pendingRef = useRef(false);
  const [status, setStatus] = useState('');
  const [autoRefresh, setAutoRefreshState] = useState(false);
  const [intervalSecs, setIntervalState] = useState(DEFAULT_REFRESH_INTERVAL_SECS);

  useReduxEffect(() => {
    pendingRef.current = false;
    setStatus(t('Developer.status.updated', { time: formatTimestamp(new Date()) }));
  }, server.Types.SERVER_STATS, [t]);

  // Desktop: any non-OK answer reads "No server statistics available yet."; a
  // request the server never answered says why instead.
  useReduxEffect<{ command: string; failure?: WebsocketTypes.CommandFailure }>(({ payload }) => {
    if (payload.command === 'getServerStats') {
      pendingRef.current = false;
      setStatus(describeFailure(payload.failure, t('Developer.status.unavailable')));
    }
  }, server.Types.DEVELOPER_COMMAND_FAILED, [t, describeFailure]);

  const refresh = useCallback(() => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    webClient.request.developer.getServerStats();
  }, [webClient]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const timer = setInterval(refresh, intervalSecs * 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, intervalSecs, refresh]);

  const setAutoRefresh = (on: boolean) => {
    setAutoRefreshState(on);
    // Desktop refreshes immediately when auto-refresh is switched on.
    if (on) {
      refresh();
    }
  };

  return {
    stats,
    status,
    refresh,
    autoRefresh,
    setAutoRefresh,
    intervalSecs,
    setIntervalSecs: (secs) => setIntervalState(clampInterval(secs)),
  };
}
