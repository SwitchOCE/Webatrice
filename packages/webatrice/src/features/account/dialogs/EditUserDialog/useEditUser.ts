import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePushToast } from '@app/components';
import { useCommandFailureMessage } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';

import { editUserErrorMessage } from '../accountResponseMessages';
import { needsPasswordCheck, type EditUserFormValues } from './editUserFormSchema';

export type EditUserProfile = Omit<EditUserFormValues, 'passwordCheck'>;

export interface EditUser {
  /** Profile values the form starts from; refreshed when the server's copy arrives. */
  profile: EditUserProfile;
  supportsPasswordHash: boolean | undefined;
  pending: boolean;
  error: string | null;
  submit: (values: EditUserFormValues) => void;
}

export function useEditUser(onDone: () => void): EditUser {
  const { t } = useTranslation();
  const webClient = useWebClient();
  const pushToast = usePushToast();
  const failureMessage = useCommandFailureMessage();
  const user = useAppSelector(server.Selectors.getUser);
  const supportsPasswordHash = useAppSelector(server.Selectors.getSupportsPasswordHash);
  const fetched = useAppSelector((state) => server.Selectors.getUserInfoByName(state, user?.name ?? ''));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Desktop actEdit re-fetches the caller's own record first: an empty user name asks Servatrice for
  // the complete session info, email included.
  useEffect(() => {
    webClient.request.session.getUserInfo('');
  }, [webClient]);

  const source = fetched ?? user;
  const profile: EditUserProfile = {
    email: source?.email ?? '',
    // Servatrice stores desktop's lowercase ISO codes; the dropdown is keyed by uppercase codes.
    country: (source?.country ?? '').toUpperCase(),
    realName: source?.realName ?? '',
  };

  const submit = ({ email, country, realName, passwordCheck }: EditUserFormValues) => {
    const emailEdit = supportsPasswordHash === false
      // Servers without password hashing take the full record, as desktop sends it.
      ? { email }
      : (needsPasswordCheck(email, { originalEmail: profile.email, supportsPasswordHash }) ? { email, passwordCheck } : {});

    setPending(true);
    setError(null);
    webClient.request.session.accountEdit(
      { realName, country: country.toLowerCase(), ...emailEdit },
      () => {
        setPending(false);
        pushToast(t('EditUserDialog.success'));
        onDone();
      },
      (responseCode, failure) => {
        setPending(false);
        setError(failureMessage(failure, editUserErrorMessage(t, responseCode)));
      },
    );
  };

  return { profile, supportsPasswordHash, pending, error, submit };
}
