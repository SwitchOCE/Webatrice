import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import {
  Command_JoinRoom_ext,
  Command_JoinRoomSchema,
  Command_LeaveRoom_ext,
  Command_LeaveRoomSchema,
  Response_JoinRoom_ext,
  Response_ResponseCode,
} from '../../generated';
import { pendingRoomJoins as pendingJoins } from './pendingRoomJoins';

/**
 * Joins a server room. Mirrors desktop `TabServer::joinRoom` / `joinRoomFinished`
 * (tab_server.cpp):
 * - A join for a room whose join is already in flight is folded into it instead of
 *   sending a second Command_JoinRoom (the server would reject it with
 *   RespContextError); a user request upgrades a pending auto-join.
 * - A failure is reported through `response.room.joinRoomFailed` with the response
 *   code, `failure` when the server never answered, and whether a user asked for the
 *   room. Auto-joins (`userInitiated = false`, desktop's `setCurrent = false`) fail
 *   without a message box on desktop, so consumers keep them silent.
 */
export function joinRoom(roomId: number, userInitiated = true): void {
  if (pendingJoins.has(roomId)) {
    if (userInitiated) {
      pendingJoins.set(roomId, true);
    }
    return;
  }
  pendingJoins.set(roomId, userInitiated);
  sendJoinRoom(roomId, false);
}

function sendJoinRoom(roomId: number, isHealingRejoin: boolean): void {
  const settle = (): boolean => {
    const userInitiated = pendingJoins.get(roomId) ?? false;
    pendingJoins.delete(roomId);
    return userInitiated;
  };

  WebClient.instance.protobuf.sendSessionCommand(Command_JoinRoom_ext, create(Command_JoinRoomSchema, { roomId }), {
    responseExt: Response_JoinRoom_ext,
    onSuccess: (response) => {
      settle();
      if (response.roomInfo) {
        WebClient.instance.response.room.joinRoom(response.roomInfo);
      }
    },
    onResponseCode: {
      // The server already counts us as a room member although the client shows no room,
      // usually because two joins overlapped. Desktop heals this once by leaving and
      // rejoining; if the rejoin is rejected the same way, the error is surfaced.
      [Response_ResponseCode.RespContextError]: () => {
        if (isHealingRejoin) {
          WebClient.instance.response.room.joinRoomFailed?.(roomId, Response_ResponseCode.RespContextError, undefined, settle());
          return;
        }
        // Not awaited: commands are processed in send order, so the server has dropped
        // the stale membership before the rejoin arrives. A failed leave only means the
        // membership was already gone, so it is not reported.
        WebClient.instance.protobuf.sendRoomCommand(roomId, Command_LeaveRoom_ext, create(Command_LeaveRoomSchema), {
          onError: () => {},
        });
        sendJoinRoom(roomId, true);
      },
    },
    onError: (responseCode, _raw, failure) => {
      WebClient.instance.response.room.joinRoomFailed?.(roomId, responseCode, failure, settle());
    },
  });
}
