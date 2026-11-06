import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

import { useReduxEffect } from '@app/hooks';
import { server } from '@cockatrice/datatrice';

export interface RegisterForm {
  emailRequired: boolean;
  emailError: string | null;
  passwordError: string | null;
  userNameError: string | null;
  error: string | null;
  onHostChange: () => void;
  onEmailChange: () => void;
  onPasswordChange: () => void;
  onUserNameChange: () => void;
}

export function useRegisterForm(): RegisterForm {
  const { t } = useTranslation();
  const [emailRequired, setEmailRequired] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [userNameError, setUserNameError] = useState<string | null>(null);
  const rawError = useSelector(server.Selectors.getRegistrationError);
  const deniedEndTime = useSelector(server.Selectors.getRegistrationDeniedEndTime);
  let error = rawError;
  if (rawError) {
    const until = new Date((deniedEndTime ?? 0) * 1000);
    if ((deniedEndTime ?? 0) > 0 && Number.isFinite(until.getTime())) {
      error = t('RegisterForm.error.retryAfter', { reason: rawError, until: until.toLocaleString() });
    }
  }

  const onHostChange = () => setEmailRequired(false);
  const onEmailChange = () => emailError && setEmailError(null);
  const onPasswordChange = () => passwordError && setPasswordError(null);
  const onUserNameChange = () => userNameError && setUserNameError(null);

  useReduxEffect(() => {
    setEmailRequired(true);
  }, server.Types.REGISTRATION_REQUIRES_EMAIL);

  useReduxEffect<{ error: string }>(({ payload: { error } }) => {
    setEmailError(error);
  }, server.Types.REGISTRATION_EMAIL_ERROR);

  useReduxEffect<{ error: string }>(({ payload: { error } }) => {
    setPasswordError(error);
  }, server.Types.REGISTRATION_PASSWORD_ERROR);

  useReduxEffect<{ error: string }>(({ payload: { error } }) => {
    setUserNameError(error);
  }, server.Types.REGISTRATION_USERNAME_ERROR);

  return {
    emailRequired,
    emailError,
    passwordError,
    userNameError,
    error,
    onHostChange,
    onEmailChange,
    onPasswordChange,
    onUserNameChange,
  };
}
