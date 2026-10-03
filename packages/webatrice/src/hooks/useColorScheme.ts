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

/** The operating system's light/dark preference, re-rendering when it changes. */
export function useSystemColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribeToSystemColorScheme, systemColorScheme, () => 'dark');
}

/**
 * The palette in effect: the appearance preference, resolved against the operating system when
 * it is "System". Until the settings row loads, the mode mirrored at the last change stands in,
 * so the palette applied at boot is not flipped to the defaults and back.
 */
export function useColorScheme(): ColorScheme {
  const ready = useSettings().status === LoadingState.READY;
  const preference = usePreference('themeMode');
  const system = useSystemColorScheme();
  return resolveColorScheme(ready ? preference : bootThemeMode(), system);
}

/**
 * Keeps `<html data-theme>` (and with it every design token) on the effective palette, and
 * mirrors the mode for the next boot. Mount once, at the app root; returns the palette.
 */
export function useApplyColorScheme(): ColorScheme {
  const scheme = useColorScheme();
  const ready = useSettings().status === LoadingState.READY;
  const mode = usePreference('themeMode');

  // Layout effect: switch the tokens before the browser paints the re-rendered tree.
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
