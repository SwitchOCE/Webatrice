import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_DeckUpload_ext, Command_DeckUploadSchema, Response_DeckUpload_ext } from '../../generated';

/**
 * Replace the contents of an existing deck in server storage
 * (`AbstractTabDeckEditor::actSaveDeck` for a remote deck).
 *
 * Servatrice's `cmdDeckUpload` branches on field presence: a set `path` creates
 * a new deck in that folder and ignores `deck_id`. So the message carries only
 * `deck_id` and `deck_list` — never `path`, not even an empty one — and the
 * server updates the deck in place. Use `deckUpload` to create a deck.
 */
export function deckUpdate(deckId: number, deckList: string): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_DeckUpload_ext,
    create(Command_DeckUploadSchema, { deckId, deckList }),
    {
      responseExt: Response_DeckUpload_ext,
      // `new_file` carries the server's re-derived name; servers that omit
      // it still acknowledge the save. Both callbacks are optional members of
      // `ISessionResponse`, so implementations that predate them still build.
      onSuccess: (response) => {
        WebClient.instance.response.session.updateServerDeck?.(deckId, response.newFile);
      },
      onError: (responseCode, _raw, failure) => {
        WebClient.instance.response.session.updateServerDeckFailed?.(deckId, responseCode, failure);
      },
    }
  );
}
