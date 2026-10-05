import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import type { CommandFailure } from '../../types/CommandFailure';

import { Command_DeckUpload_ext, Command_DeckUploadSchema, Response_DeckUpload_ext } from '../../generated';

/**
 * Replace the contents of an existing deck in server storage
 * (`AbstractTabDeckEditor::actSaveDeck` for a remote deck).
 *
 * Servatrice's `cmdDeckUpload` branches on field presence: a set `path` creates
 * a new deck in that folder and ignores `deck_id`. So the message never carries
 * `path`, not even an empty one, and the server updates the deck in place. Use
 * `deckUpload` to create a deck.
 *
 * 3.1 servers overwrite the stored color identity on every update, so callers
 * send it each time, as desktop does (`getDeckColorIdentity`); omitting it
 * blanks the column. `isPublic` changes visibility only when given. 3.0
 * servers ignore both.
 */
export function deckUpdate(
  deckId: number,
  deckList: string,
  isPublic?: boolean,
  colorIdentity?: string,
  // Local save bookkeeping needs the originating request, not just the deck id.
  // Server state still goes through the response implementation below.
  onSettled?: (error: { responseCode: number; failure?: CommandFailure } | null) => void,
): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_DeckUpload_ext,
    create(Command_DeckUploadSchema, { deckId, deckList, isPublic, colorIdentity }),
    {
      responseExt: Response_DeckUpload_ext,
      // `new_file` carries the server's re-derived name; servers that omit
      // it still acknowledge the save. Both callbacks are optional members of
      // `ISessionResponse`, so implementations that predate them still build.
      onSuccess: (response) => {
        WebClient.instance.response.session.updateServerDeck?.(deckId, response.newFile);
        onSettled?.(null);
      },
      onError: (responseCode, _raw, failure) => {
        WebClient.instance.response.session.updateServerDeckFailed?.(deckId, responseCode, failure);
        onSettled?.({ responseCode, failure });
      },
    }
  );
}
