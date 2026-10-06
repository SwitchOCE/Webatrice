import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ForceActivateUser_ext, Command_ForceActivateUserSchema, Response_ResponseCode } from '../../generated';

export function forceActivateUser(usernameToActivate: string, moderatorName: string): void {
  const cmd = create(Command_ForceActivateUserSchema, { usernameToActivate, moderatorName });
  const activated = () => {
    WebClient.instance.response.moderator.forceActivateUser(usernameToActivate, moderatorName);
  };
  WebClient.instance.protobuf.sendModeratorCommand(Command_ForceActivateUser_ext, cmd, {
    // Desktop accepts only RespActivationAccepted (tab_admin.cpp:219-233).
    onSuccess: () => {
      WebClient.instance.response.moderator.commandFailed?.('forceActivateUser', Response_ResponseCode.RespOk, usernameToActivate);
    },
    // Servatrice runs the activation through cmdActivateAccount, which answers
    // RespActivationAccepted (not RespOk) on success — the code desktop's
    // tab_admin.cpp treats as "User successfully activated".
    onResponseCode: {
      [Response_ResponseCode.RespActivationAccepted]: activated,
    },
    onError: (responseCode) => {
      WebClient.instance.response.moderator.commandFailed?.('forceActivateUser', responseCode, usernameToActivate);
    },
  });
}
