import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ReportStats_ext, Command_ReportStatsSchema, Response_ReportStats_ext } from '../../generated';

export function reportStats(onFailure?: (responseCode: number) => void): void {
  WebClient.instance.protobuf.sendModeratorCommand(Command_ReportStats_ext, create(Command_ReportStatsSchema), {
    responseExt: Response_ReportStats_ext,
    onSuccess: (response) => {
      WebClient.instance.response.moderator.reportStats?.(response);
    },
    onError: (responseCode) => {
      WebClient.instance.response.moderator.commandFailed?.('reportStats', responseCode, '');
      onFailure?.(responseCode);
    },
  });
}
