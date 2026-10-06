import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_JoinGame_ext, Command_JoinGameSchema, Response_ResponseCode } from '../../generated';
import type { JoinGameParams } from '../../generated';

// Codes handled by GameSelector::checkResponse (game_selector.cpp:228-270).
// Presentation belongs to the UI; unrecognized rejections remain silent.
const ERROR_CODES = [
  Response_ResponseCode.RespNotInRoom,
  Response_ResponseCode.RespNameNotFound,
  Response_ResponseCode.RespGameFull,
  Response_ResponseCode.RespWrongPassword,
  Response_ResponseCode.RespSpectatorsNotAllowed,
  Response_ResponseCode.RespOnlyBuddies,
  Response_ResponseCode.RespUserLevelTooLow,
  Response_ResponseCode.RespInIgnoreList,
];

export function joinGame(roomId: number, joinGameParams: JoinGameParams): void {
  const response = WebClient.instance.response.room;
  response.setJoinGamePending(true);

  const onResponseCode: { [code: number]: () => void } = {
    // Match desktop default:; — acknowledge silently, no user dialog.
    [Response_ResponseCode.RespContextError]: () => response.setJoinGamePending(false),
  };
  for (const code of ERROR_CODES) {
    onResponseCode[code] = () => response.setJoinGameError(code, '');
  }

  WebClient.instance.protobuf.sendRoomCommand(
    roomId,
    Command_JoinGame_ext,
    create(Command_JoinGameSchema, joinGameParams),
    {
      onSuccess: () => {
        response.setJoinGamePending(false);
        response.joinedGame(roomId, joinGameParams.gameId);
      },
      onResponseCode,
      onError: (_responseCode, _raw, failure) => {
        if (failure) {
          response.setJoinGameError(Response_ResponseCode.RespNotConnected, '', failure);
        } else {
          response.setJoinGamePending(false);
        }
      },
    },
  );
}
