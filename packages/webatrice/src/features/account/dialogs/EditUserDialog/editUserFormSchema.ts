import { z } from 'zod';
import type { TFunction } from 'i18next';

import { MAX_NAME_LENGTH } from '../accountLimits';

export interface EditUserSchemaContext {
  /** The email the profile was loaded with; changing it may need a password check. */
  originalEmail: string;
  /** `undefined` = not yet known; treated like a hash-capable server, the stricter case. */
  supportsPasswordHash: boolean | undefined;
}

/**
 * True when the edit must carry `passwordCheck`: Servatrice only changes the email of a session that
 * proves the real password, and hash-capable servers ask for it whenever the email changes (desktop
 * `UserInfoBox::actEditInternal`).
 */
export const needsPasswordCheck = (email: string, { originalEmail, supportsPasswordHash }: EditUserSchemaContext) =>
  supportsPasswordHash !== false && email.trim() !== originalEmail;

export const buildEditUserFormSchema = (t: TFunction, context: EditUserSchemaContext) => {
  const tooLong = t('AccountDialogs.validation.maxChars', { count: MAX_NAME_LENGTH });

  return z
    .object({
      email: z.string().trim().max(MAX_NAME_LENGTH, tooLong),
      country: z.string(),
      realName: z.string().trim().max(MAX_NAME_LENGTH, tooLong),
      passwordCheck: z.string().max(MAX_NAME_LENGTH, tooLong),
    })
    .refine((data) => !needsPasswordCheck(data.email, context) || data.passwordCheck.length > 0, {
      path: ['passwordCheck'],
      message: t('Common.validation.required'),
    });
};

export type EditUserFormValues = z.infer<ReturnType<typeof buildEditUserFormSchema>>;
