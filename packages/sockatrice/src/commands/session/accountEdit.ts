import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import type { CommandFailure } from '../../types/CommandFailure';

import { Command_AccountEdit_ext, Command_AccountEditSchema, type AccountEditParams } from '../../generated';

/**
 * Edits the logged-in user's profile. Every field is optional on the wire and Servatrice only touches
 * the ones present, so callers leave out what they don't mean to change. Changing `email` requires
 * `passwordCheck` unless the session logged in with a plaintext password (desktop
 * `UserInfoBox::actEditInternal`).
 */
export function accountEdit(
  params: Omit<AccountEditParams, '$typeName' | '$unknown'>,
  onEdited?: () => void,
  onFailure?: (responseCode: number, failure?: CommandFailure) => void,
): void {
  const { realName, email, country } = params;
  WebClient.instance.protobuf.sendSessionCommand(Command_AccountEdit_ext, create(Command_AccountEditSchema, params), {
    onSuccess: () => {
      WebClient.instance.response.session.accountEditChanged(realName, email, country);
      onEdited?.();
    },
    onError: onFailure && ((responseCode, _raw, failure) => onFailure(responseCode, failure)),
  });
}
