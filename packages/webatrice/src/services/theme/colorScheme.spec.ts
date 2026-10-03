import { withMockColorSchemeMedia, type MockColorSchemeMedia } from '../../__test-utils__';
import { ThemeMode } from '@app/types';
import {
  applyColorScheme,
  bootColorScheme,
  bootThemeMode,
  readBootThemeMode,
  resolveColorScheme,
  subscribeToSystemColorScheme,
  systemColorScheme,
  THEME_MODE_STORAGE_KEY,
  writeBootThemeMode,
} from './colorScheme';

describe('colorScheme', () => {
  let media: MockColorSchemeMedia | undefined;

  afterEach(() => {
    media?.restore();
    media = undefined;
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
  });

  test('a fixed mode ignores the system; System follows it', () => {
    expect(resolveColorScheme(ThemeMode.Light, 'dark')).toBe('light');
    expect(resolveColorScheme(ThemeMode.Dark, 'light')).toBe('dark');
    expect(resolveColorScheme(ThemeMode.System, 'light')).toBe('light');
    expect(resolveColorScheme(ThemeMode.System, 'dark')).toBe('dark');
  });

  test('reads the operating system preference, and reports its changes', () => {
    media = withMockColorSchemeMedia(false);
    expect(systemColorScheme()).toBe('light');

    const onChange = vi.fn();
    const unsubscribe = subscribeToSystemColorScheme(onChange);
    media.setPrefersDark(true);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(systemColorScheme()).toBe('dark');

    unsubscribe();
    media.setPrefersDark(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('assumes dark where the browser cannot report a preference', () => {
    expect(window.matchMedia).toBeUndefined();
    expect(systemColorScheme()).toBe('dark');
    expect(subscribeToSystemColorScheme(vi.fn())).toEqual(expect.any(Function));
  });

  test('applies a palette to the document root', () => {
    applyColorScheme('light');

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  test('round-trips the boot mirror and ignores junk in it', () => {
    expect(readBootThemeMode()).toBeUndefined();
    expect(bootThemeMode()).toBe(ThemeMode.Dark);

    writeBootThemeMode(ThemeMode.System);
    expect(readBootThemeMode()).toBe(ThemeMode.System);

    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'sepia');
    expect(readBootThemeMode()).toBeUndefined();
  });

  test('boots with the mirrored mode resolved against the system', () => {
    media = withMockColorSchemeMedia(false);
    writeBootThemeMode(ThemeMode.System);

    bootColorScheme();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  test('boots dark when nothing was mirrored', () => {
    media = withMockColorSchemeMedia(false);

    bootColorScheme();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
