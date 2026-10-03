import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ReportList_ext, Command_ReportListSchema, Response_ReportList_ext } from '../../generated';

/** Undefined `offset` / `limit` keep the proto defaults (0 / 100). */
export function reportList(unresolvedOnly?: boolean, offset?: number, limit?: number): void {
  WebClient.instance.protobuf.sendModeratorCommand(
    Command_ReportList_ext,
    create(Command_ReportListSchema, { unresolvedOnly, offset, limit }),
    {
      responseExt: Response_ReportList_ext,
      onSuccess: (response) => {
        WebClient.instance.response.moderator.reportList?.(response.reports, response.totalCount);
      },
      onError: (responseCode) => {
        WebClient.instance.response.moderator.commandFailed?.('reportList', responseCode, '');
      },
    },
  );
}
