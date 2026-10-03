import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_JoinRoom_ext, Command_JoinRoomSchema, Response_JoinRoom_ext } from '../../generated';

/**
 * `userInitiated` is false for autojoin. Desktop's TabServer::joinRoom passes
 * the same flag as `setCurrent`, and shows a failure box only when it is set.
 */
export function joinRoom(roomId: number, userInitiated = true): void {
  WebClient.instance.protobuf.sendSessionCommand(Command_JoinRoom_ext, create(Command_JoinRoomSchema, { roomId }), {
    responseExt: Response_JoinRoom_ext,
    onSuccess: (response) => {
      if (response.roomInfo) {
        WebClient.instance.response.room.joinRoom(response.roomInfo);
      }
    },
    onError: (responseCode, _raw, failure) => {
      WebClient.instance.response.room.joinRoomFailed?.(roomId, responseCode, failure, userInitiated);
    },
  });
}
