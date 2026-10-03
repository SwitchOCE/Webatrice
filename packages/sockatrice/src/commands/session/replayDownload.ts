import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ReplayDownload_ext, Command_ReplayDownloadSchema, Response_ReplayDownload_ext } from '../../generated';

/**
 * Downloads one stored replay. The bytes are a serialized `GameReplay` — the
 * exact content desktop writes to a `.cor` file. `onDownloaded` hands them to
 * the caller that asked (watch vs. save-to-file, like desktop's
 * openRemoteReplayFinished / downloadFinished) without routing a one-shot
 * payload through the store; the store notification still fires.
 */
export function replayDownload(
  replayId: number,
  onDownloaded?: (replayData: Uint8Array) => void,
  onFailure?: (responseCode: number) => void,
): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_ReplayDownload_ext,
    create(Command_ReplayDownloadSchema, { replayId }),
    {
      responseExt: Response_ReplayDownload_ext,
      onSuccess: (response) => {
        WebClient.instance.response.session.replayDownloaded(replayId, response);
        onDownloaded?.(response.replayData);
      },
      onError: onFailure,
    }
  );
}
