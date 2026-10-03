import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ReportAssign_ext, Command_ReportAssignSchema } from '../../generated';

// Desktop TabReport refreshes the queue after an assignment and shows
// "Assignment failed." otherwise, so the outcome also goes back to the caller.
// RespInvalidData means another moderator took (or closed) the report first.
export function reportAssign(
  reportId: number,
  onAssigned?: () => void,
  onFailure?: (responseCode: number) => void,
): void {
  WebClient.instance.protobuf.sendModeratorCommand(Command_ReportAssign_ext, create(Command_ReportAssignSchema, { reportId }), {
    onSuccess: () => {
      WebClient.instance.response.moderator.reportAssigned?.(reportId);
      onAssigned?.();
    },
    onError: (responseCode) => {
      WebClient.instance.response.moderator.commandFailed?.('reportAssign', responseCode, String(reportId));
      onFailure?.(responseCode);
    },
  });
}
