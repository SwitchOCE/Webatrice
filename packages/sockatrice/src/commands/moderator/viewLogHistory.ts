import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ViewLogHistory_ext, Command_ViewLogHistorySchema, Response_ViewLogHistory_ext } from '../../generated';
import type { ViewLogHistoryParams } from '../../generated';

export function viewLogHistory(filters: ViewLogHistoryParams): void {
  WebClient.instance.protobuf.sendModeratorCommand(Command_ViewLogHistory_ext, create(Command_ViewLogHistorySchema, filters), {
    responseExt: Response_ViewLogHistory_ext,
    onSuccess: (response) => {
      WebClient.instance.response.moderator.viewLogs(response.logMessage);
    },
    onError: (responseCode, _raw, failure) => {
      WebClient.instance.response.moderator.commandFailed?.('viewLogHistory', responseCode, filters.userName ?? '', failure);
    },
  });
}
