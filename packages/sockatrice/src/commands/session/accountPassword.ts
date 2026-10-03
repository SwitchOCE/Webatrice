import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import type { CommandFailure } from '../../types/CommandFailure';

import { Command_AccountPassword_ext, Command_AccountPasswordSchema } from '../../generated';
import { generateSalt, hashPassword } from '../../utils';

/**
 * Changes the logged-in user's password. Mirrors desktop `UserInfoBox::changePassword`: on servers that
 * support password hashing the new password is hashed client-side under a fresh salt and only
 * `hashedNewPassword` is sent; otherwise only the plaintext `newPassword` is. Servatrice reads
 * `new_password` whenever it is present, so the two are never sent together.
 */
export async function accountPassword(
  oldPassword: string,
  newPassword: string,
  onChanged?: () => void,
  onFailure?: (responseCode: number, failure?: CommandFailure) => void,
): Promise<void> {
  const credential = WebClient.instance.serverSupportsPasswordHash
    ? { hashedNewPassword: await hashPassword(generateSalt(), newPassword) }
    : { newPassword };

  WebClient.instance.protobuf.sendSessionCommand(
    Command_AccountPassword_ext,
    create(Command_AccountPasswordSchema, { oldPassword, ...credential }),
    {
      onSuccess: () => {
        WebClient.instance.response.session.accountPasswordChange();
        onChanged?.();
      },
      onError: onFailure && ((responseCode, _raw, failure) => onFailure(responseCode, failure)),
    },
  );
}
