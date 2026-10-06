import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ReportStatus, server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_Report } from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { useReduxEffect, useWatchReplay, type ReduxEffectAction } from '@app/hooks';
import { useAppDispatch, useAppSelector } from '@app/store';

import { useJoinReportGame } from './useJoinReportGame';
import { useReportListLoad, type ReportListLoadState } from './useReportListLoad';
import { useReportThread, type ReportThread } from './useReportThread';

/** Desktop TabReport REFRESH_INTERVAL_MS: refresh every 5 minutes while the tab is visible. */
export const REPORT_QUEUE_REFRESH_MS = 300_000;

/** The status line message key under the queue (desktop TabReport statusLabel). */
export type QueueActionMessage =
  | 'assigning' | 'assignedDone' | 'assignFailed'
  | 'resolving' | 'dismissing' | 'done' | 'actionFailed'
  | 'loadingReplay' | 'noReplay' | 'replayOpened' | 'replayParseFailed'
  | 'noRoom' | 'joining';

export interface ResolvePrompt {
  dismissed: boolean;
}

export interface ReportQueueActions {
  canAssign: boolean;
  canResolve: boolean;
  canViewReplay: boolean;
  canJoinGame: boolean;
}

export interface ReportQueue {
  search: string;
  setSearch: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  unresolvedOnly: boolean;
  setUnresolvedOnly: (value: boolean) => void;
  reports: ServerInfo_Report[];
  totalCount: number;
  loadedCount: number;
  loadState: ReportListLoadState;
  refresh: () => void;
  selectedId: number | null;
  selected: ServerInfo_Report | undefined;
  select: (reportId: number) => void;
  thread: ReportThread;
  actions: ReportQueueActions;
  actionMessage: QueueActionMessage | null;
  assign: () => void;
  resolve: () => void;
  promptResolve: (dismissed: boolean) => void;
  resolvePrompt: ResolvePrompt | null;
  submitResolvePrompt: (note: string) => void;
  cancelResolvePrompt: () => void;
  viewReplay: () => void;
  joinGame: () => void;
  userInfoFailed: boolean;
  statsOpen: boolean;
  setStatsOpen: (open: boolean) => void;
  statsState: ReportListLoadState;
}

const QUEUE_LIST_FAILURE = {
  type: server.Types.MODERATOR_COMMAND_FAILED, command: 'reportList', successType: server.Actions.reportList.type,
};

/** The assign or resolve waiting for its answer, matched by report id. */
interface PendingMutation {
  command: 'reportAssign' | 'reportResolve';
  reportId: number;
}

const NO_ACTIONS: ReportQueueActions = { canAssign: false, canResolve: false, canViewReplay: false, canJoinGame: false };

/**
 * The moderator report queue (desktop TabReport): server list with the
 * "unresolved only" switch, local search and status filters, details and
 * comments, assignment, resolve / dismiss with an optional note, the reported
 * user's history, queue statistics, and jumps to the game or its replay.
 */
export function useReportQueue(): ReportQueue {
  const webClient = useWebClient();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const watchReplay = useWatchReplay();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<QueueActionMessage | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [resolvePrompt, setResolvePrompt] = useState<ResolvePrompt | null>(null);
  // The game whose replay download is in flight; its answer is matched by id.
  const pendingReplayGameId = useRef<number | null>(null);
  const [userInfoFailedFor, setUserInfoFailedFor] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(true);
  const [statsState, setStatsState] = useState<ReportListLoadState>('loading');

  const queue = useAppSelector(server.Selectors.getReportQueue);
  const totalCount = useAppSelector(server.Selectors.getReportQueueTotalCount);
  const stats = useAppSelector(server.Selectors.getReportStats);
  const lastNotice = useAppSelector(server.Selectors.getLastReportNotice);
  const joinReportGame = useJoinReportGame();

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reports = useMemo(
    () => server.filterReports(queue, search, statusFilter),
    [queue, search, statusFilter],
  );
  // Desktop acts on the selected row of the filtered table only.
  const selected = useMemo(() => reports.find((r) => r.reportId === selectedId), [reports, selectedId]);

  const send = useCallback(
    () => webClient.request.moderator.reportList(unresolvedOnly),
    [webClient, unresolvedOnly],
  );
  const { loadState, refresh: refreshList } = useReportListLoad(queue, send, QUEUE_LIST_FAILURE);

  // Like the list: stats are "loading" until a new stats message lands.
  const statsAtRequest = useRef<typeof stats | undefined>(undefined);
  const statsRef = useRef(stats);
  useEffect(() => {
    statsRef.current = stats;
    if (statsAtRequest.current !== undefined && stats !== statsAtRequest.current) {
      statsAtRequest.current = undefined;
      setStatsState('ready');
    }
  }, [stats]);

  const requestStats = useCallback(() => {
    statsAtRequest.current = statsRef.current;
    setStatsState('loading');
    webClient.request.moderator.reportStats();
  }, [webClient]);

  const statsOpenRef = useRef(statsOpen);
  useEffect(() => {
    statsOpenRef.current = statsOpen;
  }, [statsOpen]);

  const thread = useReportThread(selected ? selectedId : null, () => refresh());
  const { reloadDetails } = thread;

  const refresh = useCallback(() => {
    setActionMessage(null);
    refreshList();
    reloadDetails();
    if (statsOpenRef.current) {
      requestStats();
    }
  }, [refreshList, reloadDetails, requestStats]);

  // Initial load, and again when "unresolved only" flips (a new server query).
  useEffect(() => {
    setActionMessage(null);
    refreshList();
    if (statsOpenRef.current) {
      requestStats();
    }
  }, [refreshList, requestStats]);

  const setStatsOpenAndLoad = useCallback((open: boolean) => {
    setStatsOpen(open);
    if (open) {
      requestStats();
    }
  }, [requestStats]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }, REPORT_QUEUE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const seenNotice = useRef(lastNotice);
  useEffect(() => {
    if (lastNotice && lastNotice !== seenNotice.current) {
      seenNotice.current = lastNotice;
      refresh();
    }
  }, [lastNotice, refresh]);

  // Reported user's history for the selected report (desktop requestUserInfo).
  const reportedUser = selected?.reportedUserName ?? '';
  useEffect(() => {
    if (!reportedUser) {
      return;
    }
    setUserInfoFailedFor(null);
    // TabReport::requestUserInfo/userInfoResponse (tab_report.cpp:780-818)
    // clears context for the selected user and rejects another user's reply.
    // Start before sending so Datatrice's single-investigation guard accepts it.
    dispatch(server.Actions.userInvestigationStarted({ userName: reportedUser }));
    webClient.request.moderator.reportUserInfo(reportedUser);
  }, [dispatch, reportedUser, webClient]);


  // Desktop TabReport::viewReplayResponse: once the replay answering this
  // request arrives, parse it and open it in a replay tab. Keyed on the
  // arrival, not the stored replay, so an earlier download of the same game
  // can't stand in for it.
  useReduxEffect((action: ReduxEffectAction<{ gameId: number; replayData: Uint8Array }>) => {
    const { gameId, replayData } = action.payload;
    if (pendingReplayGameId.current === null || gameId !== pendingReplayGameId.current) {
      return;
    }
    pendingReplayGameId.current = null;
    setActionBusy(false);
    try {
      watchReplay(replayData, t('Reports.queue.replayTitle', { gameId }));
      setActionMessage('replayOpened');
    } catch {
      setActionMessage('replayParseFailed');
    }
  }, server.Types.REPORT_REPLAY_DOWNLOADED, [watchReplay, t]);

  const actions = useMemo<ReportQueueActions>(() => {
    if (!selected || actionBusy) {
      return NO_ACTIONS;
    }
    const open = server.isReportOpen(selected.status);
    const hasGame = selected.gameId > 0;
    return {
      canAssign: selected.status === ReportStatus.OPEN,
      canResolve: open,
      canViewReplay: hasGame && selected.replayId > 0,
      canJoinGame: hasGame && selected.roomId > 0,
    };
  }, [selected, actionBusy]);

  const finish = useCallback((message: QueueActionMessage, reload: boolean) => {
    if (!mounted.current) {
      return;
    }
    setActionBusy(false);
    if (reload) {
      refresh();
    }
    setActionMessage(message);
  }, [refresh]);

  // Desktop refreshes the queue once an assign or resolve succeeds; the answer
  // reaches the view as the store's reportAssigned / reportResolved signal.
  const pendingMutation = useRef<PendingMutation | null>(null);
  useReduxEffect((action: ReduxEffectAction<{ reportId: number }>) => {
    const pending = pendingMutation.current;
    const command = action.type === server.Types.REPORT_ASSIGNED ? 'reportAssign' : 'reportResolve';
    if (pending?.command === command && pending.reportId === action.payload.reportId) {
      pendingMutation.current = null;
      finish(command === 'reportAssign' ? 'assignedDone' : 'done', true);
    }
  }, [server.Types.REPORT_ASSIGNED, server.Types.REPORT_RESOLVED], [finish]);

  // Every queue command reports failure through the moderator scope's
  // commandFailed signal (Command_ReportUserInfo's is shared with the
  // Moderation page); the list's is handled by useReportListLoad.
  useReduxEffect((action: ReduxEffectAction<{ command: WebsocketTypes.ModeratorCommandName; target: string }>) => {
    const { command, target } = action.payload;
    const pending = pendingMutation.current;
    switch (command) {
      case 'reportUserInfo':
        setUserInfoFailedFor(target);
        break;
      case 'reportStats':
        if (statsAtRequest.current !== undefined) {
          statsAtRequest.current = undefined;
          setStatsState('failed');
        }
        break;
      case 'reportAssign':
      case 'reportResolve':
        if (pending?.command === command && String(pending.reportId) === target) {
          pendingMutation.current = null;
          finish(command === 'reportAssign' ? 'assignFailed' : 'actionFailed', false);
        }
        break;
      case 'replayDownloadByGameId':
        if (pendingReplayGameId.current !== null && String(pendingReplayGameId.current) === target) {
          pendingReplayGameId.current = null;
          finish('noReplay', false);
        }
        break;
      default:
        break;
    }
  }, server.Types.MODERATOR_COMMAND_FAILED, [finish]);

  const assign = useCallback(() => {
    if (!selected) {
      return;
    }
    setActionBusy(true);
    setActionMessage('assigning');
    pendingMutation.current = { command: 'reportAssign', reportId: selected.reportId };
    webClient.request.moderator.reportAssign(selected.reportId);
  }, [selected, webClient]);

  const sendResolve = useCallback((dismissed: boolean, note: string) => {
    if (!selected) {
      return;
    }
    setActionBusy(true);
    setActionMessage(dismissed ? 'dismissing' : 'resolving');
    pendingMutation.current = { command: 'reportResolve', reportId: selected.reportId };
    webClient.request.moderator.reportResolve(selected.reportId, note || undefined, dismissed);
  }, [selected, webClient]);

  const viewReplay = useCallback(() => {
    if (!selected || selected.gameId <= 0) {
      return;
    }
    setActionBusy(true);
    setActionMessage('loadingReplay');
    pendingReplayGameId.current = selected.gameId;
    // Sockatrice clears the stored replay before sending, so only the answer
    // to this request can match the game id below.
    webClient.request.moderator.replayDownloadByGameId(selected.gameId);
  }, [selected, webClient]);

  const joinGame = useCallback(() => {
    if (!selected || selected.gameId <= 0) {
      return;
    }
    if (selected.roomId <= 0) {
      setActionMessage('noRoom');
      return;
    }
    setActionMessage('joining');
    joinReportGame(selected.gameId, selected.roomId);
  }, [selected, joinReportGame]);

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    unresolvedOnly,
    setUnresolvedOnly,
    reports,
    totalCount,
    loadedCount: queue.length,
    loadState,
    refresh,
    selectedId: selected ? selectedId : null,
    selected,
    select: setSelectedId,
    thread,
    actions,
    actionMessage,
    assign,
    resolve: () => sendResolve(false, ''),
    promptResolve: (dismissed) => setResolvePrompt({ dismissed }),
    resolvePrompt,
    submitResolvePrompt: (note) => {
      const prompt = resolvePrompt;
      setResolvePrompt(null);
      if (prompt) {
        sendResolve(prompt.dismissed, note.trim());
      }
    },
    cancelResolvePrompt: () => setResolvePrompt(null),
    viewReplay,
    joinGame,
    userInfoFailed: userInfoFailedFor !== null && userInfoFailedFor === reportedUser,
    statsOpen,
    setStatsOpen: setStatsOpenAndLoad,
    statsState,
  };
}
