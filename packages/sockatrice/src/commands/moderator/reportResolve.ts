import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ReportResolve_ext, Command_ReportResolveSchema } from '../../generated';

// Like reportAssign, the outcome also goes back to the caller (desktop
// refreshes on success, "Action failed." otherwise). RespInvalidData means the
// report was already resolved or dismissed.
export function reportResolve(
  reportId: number,
  resolutionNote?: string,
  dismissed = false,
  onResolved?: () => void,
  onFailure?: (responseCode: number) => void,
): void {
  WebClient.instance.protobuf.sendModeratorCommand(
    Command_ReportResolve_ext,
    create(Command_ReportResolveSchema, { reportId, resolutionNote, dismissed }),
    {
      onSuccess: () => {
        WebClient.instance.response.moderator.reportResolved?.(reportId, dismissed);
        onResolved?.();
      },
      onError: onFailure,
    },
  );
}
