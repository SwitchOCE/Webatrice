import type { Store } from '@reduxjs/toolkit';
import { Response_WarnList, ServerInfo_Ban, ServerInfo_ChatMessage, ServerInfo_Warning } from '@cockatrice/sockatrice/generated';
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
}
