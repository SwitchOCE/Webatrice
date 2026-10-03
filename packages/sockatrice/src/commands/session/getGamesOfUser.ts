import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_GetGamesOfUser_ext, Command_GetGamesOfUserSchema, Response_GetGamesOfUser_ext } from '../../generated';

/**
 * Desktop "Show this user's games" (UserContextMenu::execShowGames). Every failure is
 * reported with its response code, plus the transport reason when the server never
 * answered; the UI maps RespNameNotFound and RespInIgnoreList to desktop's specific
 * messages and anything else to its generic one (gamesOfUserReceived).
 */
export function getGamesOfUser(userName: string): void {
  WebClient.instance.response.session.getGamesOfUserPending?.(userName);

  WebClient.instance.protobuf.sendSessionCommand(Command_GetGamesOfUser_ext, create(Command_GetGamesOfUserSchema, { userName }), {
    responseExt: Response_GetGamesOfUser_ext,
    onSuccess: (gamesOfUser) => {
      WebClient.instance.response.session.getGamesOfUser(userName, gamesOfUser);
    },
    onError: (responseCode, _raw, failure) => {
      WebClient.instance.response.session.getGamesOfUserFailed?.(userName, responseCode, failure);
    },
  });
}
