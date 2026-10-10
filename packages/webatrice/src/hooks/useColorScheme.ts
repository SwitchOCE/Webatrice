import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';

import {
  applyColorScheme,
  bootThemeMode,
  type ColorScheme,
  resolveColorScheme,
  subscribeToSystemColorScheme,
  systemColorScheme,
  writeBootThemeMode,
} from '@app/services';
import { usePreference, useSettings } from './useSettings';
import { LoadingState } from './useSharedStore';

export function useSystemColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribeToSystemColorScheme, systemColorScheme, () => 'dark');
}

export function useColorScheme(): ColorScheme {
  const ready = useSettings().status === LoadingState.READY;
  const preference = usePreference('themeMode');
  const system = useSystemColorScheme();
  return resolveColorScheme(ready ? preference : bootThemeMode(), system);
}

export function useApplyColorScheme(): ColorScheme {
  const scheme = useColorScheme();
  const ready = useSettings().status === LoadingState.READY;
  const mode = usePreference('themeMode');

  useLayoutEffect(() => {
    applyColorScheme(scheme);
  }, [scheme]);

  useEffect(() => {
    if (ready) {
      writeBootThemeMode(mode);
    }
  }, [ready, mode]);

  return scheme;
}
