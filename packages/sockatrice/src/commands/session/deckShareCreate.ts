import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import {
  Command_DeckShareCreate_ext,
  Command_DeckShareCreateSchema,
  Response_DeckShareCreate_ext,
  type DeckShareCreateParams,
} from '../../generated';

// Share either explicit `items` (stored deck ids or inline deck lists) or a whole
// stored `folderPath`; Servatrice resolves the folder server-side.
export function deckShareCreate(params: DeckShareCreateParams): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_DeckShareCreate_ext,
    create(Command_DeckShareCreateSchema, params),
    {
      responseExt: Response_DeckShareCreate_ext,
      onSuccess: (response) => {
        WebClient.instance.response.session.deckShareCreated?.(response);
      },
    }
  );
}
