import { ThemeMode } from '@app/types';

import type { ColorScheme } from './palettes';

/** Matches while the operating system asks for dark interfaces. */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/**
 * The theme mode, mirrored out of IndexedDB so the palette is right on the first paint. The
 * settings row stays the source of truth; this copy only covers the moment before it loads.
 */
export const THEME_MODE_STORAGE_KEY = 'webatrice.themeMode';

/** The operating system's preference. Dark — the app's original look — where it cannot be read. */
export function systemColorScheme(): ColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light';
}

/** Calls `onChange` whenever the operating system switches between light and dark. */
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

/**
 * Points the design tokens (`styles/tokens.css`) at a palette, and tells the browser which
 * scheme native controls and scrollbars should use.
 */
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

/**
 * The mode to paint with before the settings row has loaded: the mirrored choice, else dark.
 * Dark rather than desktop's System default, because a browser without the mirror is almost
 * always one that predates the preference, and those keep the dark palette (settings v2).
 */
export const bootThemeMode = (): ThemeMode => readBootThemeMode() ?? ThemeMode.Dark;

/** Applies the palette before React renders, so the first paint is already correct. */
export function bootColorScheme(): void {
  applyColorScheme(resolveColorScheme(bootThemeMode(), systemColorScheme()));
}

/**
 * Keeps the boot palette current in a window that never loads settings (the card-preview popup):
 * re-applies it when another window mirrors a new mode, or when the system switches in System
 * mode. Returns the function that stops following.
 */
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
