import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import {
  Command_ReplayDownloadByGameId_ext,
  Command_ReplayDownloadByGameIdSchema,
  Response_ReplayDownloadByGameId_ext,
} from '../../generated';

// RespNameNotFound means the game left no replay; desktop TabReport shows
// "No replay available for this game." for any failure.
export function replayDownloadByGameId(gameId: number): void {
  WebClient.instance.response.moderator.replayDownloadByGameIdPending?.(gameId);
  WebClient.instance.protobuf.sendModeratorCommand(
    Command_ReplayDownloadByGameId_ext,
    create(Command_ReplayDownloadByGameIdSchema, { gameId }),
    {
      responseExt: Response_ReplayDownloadByGameId_ext,
      onSuccess: (response) => {
        WebClient.instance.response.moderator.replayDownloadedByGameId?.(gameId, response);
      },
      onError: (responseCode, _raw, failure) => {
        WebClient.instance.response.moderator.commandFailed?.('replayDownloadByGameId', responseCode, String(gameId), failure);
      },
    },
  );
}
