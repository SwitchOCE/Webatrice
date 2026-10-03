import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ReportAssign_ext, Command_ReportAssignSchema } from '../../generated';

export function reportAssign(reportId: number): void {
  WebClient.instance.protobuf.sendModeratorCommand(Command_ReportAssign_ext, create(Command_ReportAssignSchema, { reportId }), {
    onSuccess: () => {
      WebClient.instance.response.moderator.reportAssigned?.(reportId);
    },
  });
}
