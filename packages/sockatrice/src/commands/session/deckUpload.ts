import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_DeckUpload_ext, Command_DeckUploadSchema, Response_DeckUpload_ext } from '../../generated';

// `isPublic` and `colorIdentity` are 3.1 fields (#7241): publish on upload, and the
// color identity the server cannot derive itself. 3.0 servers ignore them.
// Optional client-only identity is echoed on both outcomes, independent of the server-assigned name.
export function deckUpload(
  path: string, deckId: number, deckList: string, isPublic?: boolean, colorIdentity?: string,
  ...correlation: [requestId?: string]
): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_DeckUpload_ext,
    create(Command_DeckUploadSchema, { path, deckId, deckList, isPublic, colorIdentity }),
    {
      responseExt: Response_DeckUpload_ext,
      onSuccess: (response) => {
        if (response.newFile) {
          WebClient.instance.response.session.uploadServerDeck(path, response.newFile, ...correlation);
        }
      },
      onError: (responseCode, _raw, failure) => {
        WebClient.instance.response.session.deckUploadFailed?.(path, responseCode, failure, ...correlation);
      },
    }
  );
}
