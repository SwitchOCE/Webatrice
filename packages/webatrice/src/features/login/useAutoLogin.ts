import { useEffect } from 'react';

import { getKnownHosts } from '@app/feature-widgets/known-hosts';
import { getSettings } from '../../hooks/useSettings';
import type { LoginFormValues } from './forms/LoginForm/loginFormSchema';

/** The login form's values minus its auto-connect preference, which auto-login only reads from settings. */
export type AutoLoginValues = Omit<LoginFormValues, 'autoConnect'>;

export const autoLoginGate = { hasChecked: false };

export function useAutoLogin(
  onLogin: (values: AutoLoginValues) => void,
  connectionAttemptMade: boolean,
): void {
  useEffect(() => {
    if (autoLoginGate.hasChecked) {
      return;
    }
    if (connectionAttemptMade) {
      return;
    }

    let cancelled = false;

    Promise.all([getSettings(), getKnownHosts()]).then(([settings, hosts]) => {
      if (cancelled || autoLoginGate.hasChecked) {
        return;
      }
      autoLoginGate.hasChecked = true;

      if (!settings.autoConnect) {
        return;
      }
      const { selectedHost } = hosts;
      if (!selectedHost?.remember || !selectedHost?.hashedPassword) {
        return;
      }

      onLogin({
        selectedHost,
        userName: selectedHost.userName ?? '',
        remember: true,
        password: '',
      });
    });

    return () => {
      cancelled = true;
    };
  }, [connectionAttemptMade, onLogin]);
}
