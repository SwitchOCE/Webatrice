import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { server, ServerCapability } from '@cockatrice/datatrice';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import { useAppSelector } from '@app/store';

import ReportUserDialog, { type OpenReportUserParams } from './ReportUserDialog';

/**
 * Where a report is opened from. Desktop's report action takes the game and the
 * chat log from the `UserContextMenu` it was raised in: the game when the menu
 * belongs to a game tab, and `ChatView::getRecentChatLog(50)` when the name was
 * right-clicked inside a chat view. A chat or game surface wraps itself in a
 * scope so any report opened inside it (including from the shared user menu)
 * attaches the same context, without threading props through the menu.
 */
export interface ReportChatScopeValue {
  gameId?: number;
  /** Read when the report opens, so the log is as fresh as the click. */
  getChatContext?: () => string;
}

const ReportChatScopeContext = createContext<ReportChatScopeValue>({});

export function ReportChatScope({ children, gameId, getChatContext }: ReportChatScopeValue & { children: ReactNode }) {
  const value = useMemo(() => ({ gameId, getChatContext }), [gameId, getChatContext]);
  return <ReportChatScopeContext.Provider value={value}>{children}</ReportChatScopeContext.Provider>;
}

const OpenReportUserContext = createContext<(params: OpenReportUserParams) => void>(() => {});

/**
 * Mounts the report dialog once for the app; `useReportUser().openReportUser`
 * opens it from anywhere below.
 */
export function ReportUserProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<OpenReportUserParams | null>(null);
  // A new key per request resets the form, like desktop's fresh DlgReportUser.
  const [requestKey, setRequestKey] = useState(0);

  const open = useCallback((params: OpenReportUserParams) => {
    setRequest(params);
    setRequestKey((key) => key + 1);
  }, []);
  const close = useCallback(() => setRequest(null), []);

  return (
    <OpenReportUserContext.Provider value={open}>
      {children}
      {request && <ReportUserDialog key={requestKey} request={request} onClose={close} />}
    </OpenReportUserContext.Provider>
  );
}

export interface ReportUserActions {
  /** The server takes reports and the local user is registered; desktop then lists "Report user" in user menus. */
  reportingAvailable: boolean;
  /**
   * Desktop shows "Report user" when the server takes reports and the local
   * user is registered (guests can't report), and enables it for anyone but
   * yourself.
   */
  canReportUser: (userName: string) => boolean;
  /** Opens the report dialog; a missing game or chat context comes from the nearest `ReportChatScope`. */
  openReportUser: (params: OpenReportUserParams) => void;
}

export function useReportUser(): ReportUserActions {
  const open = useContext(OpenReportUserContext);
  const scope = useContext(ReportChatScopeContext);
  const supported = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.REPORTS));
  const self = useAppSelector(server.Selectors.getUser);

  const registered = !!self
    && (self.userLevel & ServerInfo_User_UserLevelFlag.IsRegistered) === ServerInfo_User_UserLevelFlag.IsRegistered;
  const selfName = self?.name;

  const reportingAvailable = supported && registered;
  const canReportUser = useCallback(
    (userName: string) => reportingAvailable && !!userName && userName !== selfName,
    [reportingAvailable, selfName],
  );

  const openReportUser = useCallback((params: OpenReportUserParams) => {
    open({
      userName: params.userName,
      gameId: params.gameId ?? scope.gameId,
      chatContext: params.chatContext ?? scope.getChatContext?.(),
    });
  }, [open, scope]);

  return useMemo(
    () => ({ reportingAvailable, canReportUser, openReportUser }),
    [reportingAvailable, canReportUser, openReportUser],
  );
}
