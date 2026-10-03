import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ReportResolve_ext, Command_ReportResolveSchema } from '../../generated';

// RespInvalidData means the report was already resolved or dismissed.
export function reportResolve(reportId: number, resolutionNote?: string, dismissed = false): void {
  WebClient.instance.protobuf.sendModeratorCommand(
    Command_ReportResolve_ext,
    create(Command_ReportResolveSchema, { reportId, resolutionNote, dismissed }),
    {
      onSuccess: () => {
        WebClient.instance.response.moderator.reportResolved?.(reportId, dismissed);
      },
      onError: (responseCode, _raw, failure) => {
        WebClient.instance.response.moderator.commandFailed?.('reportResolve', responseCode, String(reportId), failure);
      },
    },
  );
}
