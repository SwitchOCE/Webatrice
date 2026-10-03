import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ReportAssign_ext, Command_ReportAssignSchema } from '../../generated';

// RespInvalidData means another moderator took (or closed) the report first.
export function reportAssign(reportId: number): void {
  WebClient.instance.protobuf.sendModeratorCommand(Command_ReportAssign_ext, create(Command_ReportAssignSchema, { reportId }), {
    onSuccess: () => {
      WebClient.instance.response.moderator.reportAssigned?.(reportId);
    },
    onError: (responseCode, _raw, failure) => {
      WebClient.instance.response.moderator.commandFailed?.('reportAssign', responseCode, String(reportId), failure);
    },
  });
}
