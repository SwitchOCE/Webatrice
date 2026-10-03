import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import { Command_DeckSetVisibility_ext, Command_DeckSetVisibilitySchema, type DeckSetVisibilityParams } from '../../generated';

// Targets either one stored deck (`deckId`) or a folder (`folderPath`, inherited
// by every deck under it); the two are mutually exclusive on the wire.
export function deckSetVisibility(params: DeckSetVisibilityParams): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_DeckSetVisibility_ext,
    create(Command_DeckSetVisibilitySchema, params),
    {
      onSuccess: () => {
        WebClient.instance.response.session.deckVisibilityChanged?.(params);
      },
    }
  );
}
