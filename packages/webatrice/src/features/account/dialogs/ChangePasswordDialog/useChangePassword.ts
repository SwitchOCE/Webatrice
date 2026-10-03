import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePushToast } from '@app/components';
import { useCommandFailureMessage } from '@app/hooks';
import { useWebClient } from '@cockatrice/datatrice/react';

import { changePasswordErrorMessage } from '../accountResponseMessages';
import type { ChangePasswordFormValues } from './changePasswordFormSchema';

export interface ChangePassword {
  pending: boolean;
  error: string | null;
  submit: (values: ChangePasswordFormValues) => void;
}

/**
 * Sends Command_AccountPassword. Whether the new password travels hashed is Sockatrice's call (it knows
 * the server's capability), mirroring desktop `UserInfoBox::changePassword`. The passwords live only
 * in the form state, which unmounts with the dialog.
 */
export function useChangePassword(onDone: () => void): ChangePassword {
  const { t } = useTranslation();
  const webClient = useWebClient();
  const pushToast = usePushToast();
  const failureMessage = useCommandFailureMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = ({ oldPassword, newPassword }: ChangePasswordFormValues) => {
    setPending(true);
    setError(null);
    void webClient.request.session.accountPassword(
      oldPassword,
      newPassword,
      () => {
        setPending(false);
        pushToast(t('ChangePasswordDialog.success'));
        onDone();
      },
      (responseCode, failure) => {
        setPending(false);
        setError(failureMessage(failure, changePasswordErrorMessage(t, responseCode)));
      },
    );
  };

  return { pending, error, submit };
}
