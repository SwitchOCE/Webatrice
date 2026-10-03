import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import type { RequestId } from '../../types/RequestId';

import { Command_ViewLogHistory_dev_ext, Command_ViewLogHistorySchema, Response_ViewLogHistory_ext } from '../../generated';
import type { ViewLogHistoryParams } from '../../generated';

// Developer-family log lookup (narrowed server-side). Desktop's TabLog picks this
// family only for developers who are not also moderators, and feeds both families
// into the same log view, so the result lands in the moderator viewLogs handler.
// Echoes the optional request id on both outcomes, like the moderator family.
export function viewLogHistory(filters: ViewLogHistoryParams, ...correlation: [requestId?: RequestId]): void {
  WebClient.instance.protobuf.sendDeveloperCommand(Command_ViewLogHistory_dev_ext, create(Command_ViewLogHistorySchema, filters), {
    responseExt: Response_ViewLogHistory_ext,
    onSuccess: (response) => {
      WebClient.instance.response.moderator.viewLogs(response.logMessage, ...correlation);
    },
    onError: (responseCode, _raw, failure) => {
      WebClient.instance.response.moderator.commandFailed?.(
        'viewLogHistory', responseCode, filters.userName ?? '', failure, ...correlation,
      );
    },
  });
}
