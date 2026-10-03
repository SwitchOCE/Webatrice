import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_ReportUserInfo_ext, Command_ReportUserInfoSchema, Response_ReportUserInfo_ext } from '../../generated';

export function reportUserInfo(userName: string): void {
  WebClient.instance.protobuf.sendModeratorCommand(
    Command_ReportUserInfo_ext,
    create(Command_ReportUserInfoSchema, { userName }),
    {
      responseExt: Response_ReportUserInfo_ext,
      onSuccess: (response) => {
        WebClient.instance.response.moderator.reportUserInfo?.(response);
      },
    },
  );
}
