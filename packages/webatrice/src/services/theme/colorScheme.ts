import { ThemeMode } from '@app/types';

import type { ColorScheme } from './palettes';

export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export const THEME_MODE_STORAGE_KEY = 'webatrice.themeMode';

export function systemColorScheme(): ColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light';
}

export function subscribeToSystemColorScheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const query = window.matchMedia(DARK_SCHEME_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function resolveColorScheme(mode: ThemeMode, system: ColorScheme): ColorScheme {
  switch (mode) {
    case ThemeMode.Light:
      return 'light';
    case ThemeMode.Dark:
      return 'dark';
    default:
      return system;
  }
}

export function applyColorScheme(scheme: ColorScheme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
}

export function readBootThemeMode(): ThemeMode | undefined {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return Object.values(ThemeMode).find((mode) => mode === stored);
  } catch {
    return undefined;
  }
}

export function writeBootThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage blocked: the next boot starts dark until settings load.
  }
}

export const bootThemeMode = (): ThemeMode => readBootThemeMode() ?? ThemeMode.Dark;

export function bootColorScheme(): void {
  applyColorScheme(resolveColorScheme(bootThemeMode(), systemColorScheme()));
}

export function followBootColorScheme(): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_MODE_STORAGE_KEY) {
      bootColorScheme();
    }
  };
  window.addEventListener('storage', onStorage);
  const unsubscribeSystem = subscribeToSystemColorScheme(bootColorScheme);
  return () => {
    window.removeEventListener('storage', onStorage);
    unsubscribeSystem();
  };
}
