import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import {
  Command_ReplayDownloadByGameId_ext,
  Command_ReplayDownloadByGameIdSchema,
  Response_ReplayDownloadByGameId_ext,
} from '../../generated';

export function replayDownloadByGameId(gameId: number): void {
  WebClient.instance.protobuf.sendModeratorCommand(
    Command_ReplayDownloadByGameId_ext,
    create(Command_ReplayDownloadByGameIdSchema, { gameId }),
    {
      responseExt: Response_ReplayDownloadByGameId_ext,
      onSuccess: (response) => {
        WebClient.instance.response.moderator.replayDownloadedByGameId?.(gameId, response);
      },
    },
  );
}
