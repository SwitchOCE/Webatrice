import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_GetUserSessions_ext, Command_GetUserSessionsSchema, Response_UserSessions_ext } from '../../generated';

/** `limit` left undefined keeps the proto default (110). */
export function getUserSessions(userName: string, limit?: number): void {
  WebClient.instance.protobuf.sendModeratorCommand(
    Command_GetUserSessions_ext,
    create(Command_GetUserSessionsSchema, { userName, limit }),
    {
      responseExt: Response_UserSessions_ext,
      onSuccess: (response) => {
        WebClient.instance.response.moderator.userSessions?.(userName, response.sessions);
      },
    },
  );
}
