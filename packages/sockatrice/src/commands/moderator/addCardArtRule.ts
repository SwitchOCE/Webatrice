import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';

import { Command_AddCardArtRule_ext, Command_AddCardArtRuleSchema } from '../../generated';

/** Wire values Servatrice accepts for Command_AddCardArtRule.mode. */
export type CardArtRuleMode = 'ALLOW' | 'DENY';

export function addCardArtRule(cardName: string, cardProviderId: string, mode: CardArtRuleMode, reason = ''): void {
  WebClient.instance.protobuf.sendModeratorCommand(
    Command_AddCardArtRule_ext,
    create(Command_AddCardArtRuleSchema, { cardName, cardProviderId, mode, reason }),
    {
      onSuccess: () => {
        WebClient.instance.response.moderator.cardArtRuleAdded?.(cardName, cardProviderId, mode, reason);
      },
    },
  );
}
