import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import {
  Command_DeckShareCreate_ext,
  Command_DeckShareCreateSchema,
  Response_DeckShareCreate_ext,
  type DeckShareCreateParams,
} from '../../generated';
import type { RequestId } from '../../types/RequestId';

// Share either explicit `items` (stored deck ids or inline deck lists) or a whole
// stored `folderPath`; Servatrice resolves the folder server-side.
// Optional client-only identity is echoed on both outcomes, never sent to Servatrice.
// The tuple preserves the existing callback arity when callers omit it.
export function deckShareCreate(params: DeckShareCreateParams, ...correlation: [requestId?: RequestId]): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_DeckShareCreate_ext,
    create(Command_DeckShareCreateSchema, params),
    {
      responseExt: Response_DeckShareCreate_ext,
      onSuccess: (response) => {
        WebClient.instance.response.session.deckShareCreated?.(response, ...correlation);
      },
      onError: (responseCode, _raw, failure) => {
        WebClient.instance.response.session.commandFailed?.(
          'deckShareCreate', responseCode, params.folderPath ?? '', failure, ...correlation,
        );
      },
    }
  );
}
