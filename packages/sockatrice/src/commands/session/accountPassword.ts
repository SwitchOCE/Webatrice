import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import type { CommandFailure } from '../../types/CommandFailure';

import { Command_AccountPassword_ext, Command_AccountPasswordSchema, type AccountPasswordParams } from '../../generated';
import { generateSalt, hashPassword } from '../../utils';

/**
 * @deprecated Pass `onChanged`/`onFailure` instead and let Sockatrice hash the new password. This
 * form sends the non-empty credentials exactly as given.
 */
export function accountPassword(oldPassword: string, newPassword: string, hashedNewPassword: string): void;
/**
 * Changes the logged-in user's password. Mirrors desktop `UserInfoBox::changePassword`: on servers that
 * support password hashing the new password is hashed client-side under a fresh salt and only
 * `hashedNewPassword` is sent; otherwise only the plaintext `newPassword` is. Servatrice reads
 * `new_password` whenever it is present, so the two are never sent together.
 *
 * The returned promise rejects only when hashing fails (e.g. no `crypto.subtle` in an insecure
 * context); the command is not sent in that case.
 */
export function accountPassword(
  oldPassword: string,
  newPassword: string,
  onChanged?: () => void,
  onFailure?: (responseCode: number, failure?: CommandFailure) => void,
): Promise<void>;
export function accountPassword(
  oldPassword: string,
  newPassword: string,
  onChangedOrHashedNewPassword?: (() => void) | string,
  onFailure?: (responseCode: number, failure?: CommandFailure) => void,
): Promise<void> | void {
  if (typeof onChangedOrHashedNewPassword === 'string') {
    sendAccountPassword({
      oldPassword,
      newPassword: newPassword || undefined,
      hashedNewPassword: onChangedOrHashedNewPassword || undefined,
    });
    return;
  }
  return changePassword(oldPassword, newPassword, onChangedOrHashedNewPassword, onFailure);
}

async function changePassword(
  oldPassword: string,
  newPassword: string,
  onChanged?: () => void,
  onFailure?: (responseCode: number, failure?: CommandFailure) => void,
): Promise<void> {
  const credential = WebClient.instance.serverSupportsPasswordHash
    ? { hashedNewPassword: await hashPassword(generateSalt(), newPassword) }
    : { newPassword };

  sendAccountPassword({ oldPassword, ...credential }, onChanged, onFailure);
}

function sendAccountPassword(
  params: AccountPasswordParams,
  onChanged?: () => void,
  onFailure?: (responseCode: number, failure?: CommandFailure) => void,
): void {
  WebClient.instance.protobuf.sendSessionCommand(Command_AccountPassword_ext, create(Command_AccountPasswordSchema, params), {
    onSuccess: () => {
      WebClient.instance.response.session.accountPasswordChange();
      onChanged?.();
    },
    onError: onFailure && ((responseCode, _raw, failure) => onFailure(responseCode, failure)),
  });
}
