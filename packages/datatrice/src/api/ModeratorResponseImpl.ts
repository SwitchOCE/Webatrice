import type { Store } from '@reduxjs/toolkit';
import {
  Response_CardArtRuleEntry,
  Response_ReportUserInfo,
  Response_WarnList,
  ServerInfo_Ban,
  ServerInfo_ChatMessage,
  ServerInfo_ModeratorLogin,
  ServerInfo_UserAlt,
  ServerInfo_UserSession,
  ServerInfo_Warning,
} from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { Actions as ServerActions } from '../store/server/server.actions';

export class ModeratorResponseImpl implements WebsocketTypes.IModeratorResponse {
  constructor(private store: Store) {}

  banFromServer(userName: string): void {
    this.store.dispatch(ServerActions.banFromServer({ userName }));
  }

  banHistory(userName: string, banHistory: ServerInfo_Ban[], requestId?: string): void {
    this.store.dispatch(ServerActions.banHistory({ userName, banHistory, requestId }));
  }

  viewLogs(logs: ServerInfo_ChatMessage[], requestId?: string): void {
    this.store.dispatch(ServerActions.viewLogs({ logs, requestId }));
  }

  warnHistory(userName: string, warnHistory: ServerInfo_Warning[], requestId?: string): void {
    this.store.dispatch(ServerActions.warnHistory({ userName, warnHistory, requestId }));
  }

  warnListOptions(warnList: Response_WarnList[], requestId?: string): void {
    this.store.dispatch(ServerActions.warnListOptions({ warnList, requestId }));
  }

  warnUser(userName: string): void {
    this.store.dispatch(ServerActions.warnUser({ userName }));
  }

  grantReplayAccess(replayId: number, moderatorName: string): void {
    this.store.dispatch(ServerActions.grantReplayAccess({ replayId, moderatorName }));
  }

  forceActivateUser(usernameToActivate: string, moderatorName: string): void {
    this.store.dispatch(ServerActions.forceActivateUser({ usernameToActivate, moderatorName }));
  }

  getAdminNotes(userName: string, notes: string, requestId?: string): void {
    this.store.dispatch(ServerActions.getAdminNotes({ userName, notes, requestId }));
  }

  updateAdminNotes(userName: string, notes: string): void {
    this.store.dispatch(ServerActions.updateAdminNotes({ userName, notes }));
  }

  commandFailed(
    command: WebsocketTypes.ModeratorCommandName,
    responseCode: number,
    target: string,
    failure?: WebsocketTypes.CommandFailure,
    requestId?: string,
  ): void {
    this.store.dispatch(ServerActions.moderatorCommandFailed({ command, responseCode, target, failure, requestId }));
  }

  // ── Staff tools (Cockatrice 3.1: TabModeration, TabCardArtRules) ──────────

  reportUserInfo(info: Response_ReportUserInfo): void {
    this.store.dispatch(ServerActions.userInfoReport({ info }));
  }

  userAlts(userName: string, alts: ServerInfo_UserAlt[]): void {
    this.store.dispatch(ServerActions.userAlts({ userName, alts }));
  }

  userSessions(userName: string, sessions: ServerInfo_UserSession[]): void {
    this.store.dispatch(ServerActions.userSessions({ userName, sessions }));
  }

  moderatorLastLogins(logins: ServerInfo_ModeratorLogin[]): void {
    this.store.dispatch(ServerActions.moderatorLastLogins({ logins }));
  }

  userAvatarRemoved(userName: string): void {
    this.store.dispatch(ServerActions.userAvatarRemoved({ userName }));
  }

  cardArtRules(entries: Response_CardArtRuleEntry[]): void {
    this.store.dispatch(ServerActions.cardArtRules({ entries }));
  }

  cardArtRuleAdded(cardName: string, cardProviderId: string, mode: string, reason: string): void {
    this.store.dispatch(ServerActions.cardArtRuleAdded({ cardName, cardProviderId, mode, reason }));
  }

  cardArtRuleRemoved(cardName: string, cardProviderId: string): void {
    this.store.dispatch(ServerActions.cardArtRuleRemoved({ cardName, cardProviderId }));
  }
}
