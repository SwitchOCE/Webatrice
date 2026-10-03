import type { Store } from '@reduxjs/toolkit';
import { Response_GetServerStats } from '@cockatrice/sockatrice/generated';
import type { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { Actions as ServerActions } from '../store/server/server.actions';

// Developer staff role (Cockatrice 3.1, desktop TabDeveloper). Developer log
// lookups share IModeratorResponse.viewLogs, so only the server stats land here.
export class DeveloperResponseImpl implements WebsocketTypes.IDeveloperResponse {
  constructor(private store: Store) {}

  serverStats(stats: Response_GetServerStats): void {
    this.store.dispatch(ServerActions.serverStats({ stats }));
  }

  commandFailed(
    command: WebsocketTypes.DeveloperCommandName,
    responseCode: number,
    target: string,
    failure?: WebsocketTypes.CommandFailure,
  ): void {
    this.store.dispatch(ServerActions.developerCommandFailed({ command, responseCode, target, failure }));
  }
}
