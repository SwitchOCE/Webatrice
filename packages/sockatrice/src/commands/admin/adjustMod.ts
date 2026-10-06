import { create } from '@bufbuild/protobuf';
import { Command_AdjustMod_ext, Command_AdjustModSchema } from '../../generated';
import { WebClient } from '../../WebClient';
import type { RequestId } from '../../types/RequestId';

// Servatrice changes a role only when its flag is present (cmdAdjustMod's
// has_should_be_*), so an undefined flag leaves that role untouched.
/** Echo the client-only identity on both outcomes; omission preserves legacy callback arity. */
export function adjustMod(
  userName: string, shouldBeMod?: boolean, shouldBeJudge?: boolean, shouldBeDeveloper?: boolean,
  ...correlation: [requestId?: RequestId]
): void {
  WebClient.instance.protobuf.sendAdminCommand(
    Command_AdjustMod_ext,
    create(Command_AdjustModSchema, { userName, shouldBeMod, shouldBeJudge, shouldBeDeveloper }),
    {
      onSuccess: () => {
        WebClient.instance.response.admin.adjustMod(userName, shouldBeMod, shouldBeJudge, shouldBeDeveloper, ...correlation);
      },
      onError: (responseCode, _raw, failure) => {
        WebClient.instance.response.admin.commandFailed?.('adjustMod', responseCode, userName, failure, ...correlation);
      },
    }
  );
}
