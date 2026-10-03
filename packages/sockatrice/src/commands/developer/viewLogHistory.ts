import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ViewLogHistory_dev_ext, Command_ViewLogHistorySchema, Response_ViewLogHistory_ext } from '../../generated';
import type { ViewLogHistoryParams } from '../../generated';

// Developer-family log lookup (narrowed server-side). Desktop's TabLog picks this
// family only for developers who are not also moderators, and feeds both families
// into the same log view, so the result lands in the moderator viewLogs handler.
export function viewLogHistory(filters: ViewLogHistoryParams): void {
  WebClient.instance.protobuf.sendDeveloperCommand(Command_ViewLogHistory_dev_ext, create(Command_ViewLogHistorySchema, filters), {
    responseExt: Response_ViewLogHistory_ext,
    onSuccess: (response) => {
      WebClient.instance.response.moderator.viewLogs(response.logMessage);
    },
    onError: (responseCode) => {
      WebClient.instance.response.moderator.commandFailed?.('viewLogHistory', responseCode, filters.userName ?? '');
    },
  });
}
