import { create } from '@bufbuild/protobuf';
import { Command_AdjustMod_ext, Command_AdjustModSchema } from '../../generated';
import { WebClient } from '../../WebClient';

// Servatrice changes a role only when its flag is present (cmdAdjustMod's
// has_should_be_*), so an undefined flag leaves that role untouched.
export function adjustMod(userName: string, shouldBeMod?: boolean, shouldBeJudge?: boolean, shouldBeDeveloper?: boolean): void {
  WebClient.instance.protobuf.sendAdminCommand(
    Command_AdjustMod_ext,
    create(Command_AdjustModSchema, { userName, shouldBeMod, shouldBeJudge, shouldBeDeveloper }),
    {
      onSuccess: () => {
        WebClient.instance.response.admin.adjustMod(userName, shouldBeMod, shouldBeJudge, shouldBeDeveloper);
      },
      onError: (responseCode) => {
        WebClient.instance.response.admin.commandFailed?.('adjustMod', responseCode, userName);
      },
    }
  );
}
