import { create } from '@bufbuild/protobuf';
import {
  Command_DeckSelect_ext,
  Command_DeckSelectSchema,
  Response_DeckDownload_ext,
  type DeckSelectParams,
} from '../../generated';
import { WebClient } from '../../WebClient';

/**
 * Selects a deck for the local seat. Servatrice answers with Response_DeckDownload carrying the
 * deck as it stored it (`writeToString_Native`, including the current sideboard plan) — desktop's
 * `DeckViewContainer::deckSelectFinished` builds its pre-game deck view from that string, so it is
 * routed into the store. Other players only see the Event_PlayerPropertiesChanged deck hash.
 */
export function deckSelect(gameId: number, params: DeckSelectParams): void {
  WebClient.instance.protobuf.sendGameCommand(
    gameId,
    Command_DeckSelect_ext,
    create(Command_DeckSelectSchema, params),
    {
      responseExt: Response_DeckDownload_ext,
      onSuccess: (resp) => WebClient.instance.response.game.deckSelected?.(gameId, resp.deck),
    },
  );
}
