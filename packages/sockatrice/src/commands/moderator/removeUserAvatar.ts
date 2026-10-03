import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_RemoveUserAvatar_ext, Command_RemoveUserAvatarSchema, Response_RemoveUserAvatar_ext } from '../../generated';

export function removeUserAvatar(userName: string): void {
  WebClient.instance.protobuf.sendModeratorCommand(
    Command_RemoveUserAvatar_ext,
    create(Command_RemoveUserAvatarSchema, { userName }),
    {
      responseExt: Response_RemoveUserAvatar_ext,
      onSuccess: (response) => {
        // Servatrice echoes the canonical account name it acted on.
        WebClient.instance.response.moderator.userAvatarRemoved?.(response.userName || userName);
      },
    },
  );
}
