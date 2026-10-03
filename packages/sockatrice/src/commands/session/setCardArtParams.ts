import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import { Command_SetCardArtParams_ext, Command_SetCardArtParamsSchema, type SetCardArtParamsParams } from '../../generated';

// An empty `cardName` clears the art. On success Servatrice rebroadcasts the
// caller's ServerInfo_User via Event_UserJoined, so the new card_art_params reach
// state through the existing userJoined handler; the callbacks only report the
// outcome (RespFunctionNotAllowed = a moderator card-art rule denies the card).
export function setCardArtParams(
  params: SetCardArtParamsParams,
  onSuccess?: () => void,
  onFailure?: (responseCode: number) => void,
): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_SetCardArtParams_ext,
    create(Command_SetCardArtParamsSchema, params),
    {
      onSuccess,
      onError: onFailure,
    }
  );
}
