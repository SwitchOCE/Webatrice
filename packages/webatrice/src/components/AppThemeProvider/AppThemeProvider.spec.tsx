import { act, render, screen } from '@testing-library/react';
import { useTheme } from '@mui/material/styles';

import { withMockColorSchemeMedia, type MockColorSchemeMedia } from '../../__test-utils__';
import { makeSettingsHook } from '../../hooks/__mocks__/useSettings';
import { usePreferences, useSettings } from '../../hooks/useSettings';
import { LoadingState } from '../../hooks/useSharedStore';
import { PALETTES, THEME_MODE_STORAGE_KEY } from '@app/services';
import { PREFERENCE_DEFAULTS, ThemeMode } from '@app/types';
import AppThemeProvider from './AppThemeProvider';

vi.mock('../../hooks/useSettings');

function MuiMode() {
  const theme = useTheme();
  return <span data-testid="mui">{`${theme.palette.mode} ${theme.palette.primary.main}`}</span>;
}

const preferMode = (themeMode: ThemeMode) => {
  vi.mocked(usePreferences).mockReturnValue({ ...PREFERENCE_DEFAULTS, themeMode });
};

const renderApp = () => render(<AppThemeProvider><MuiMode /></AppThemeProvider>);
const documentTheme = () => document.documentElement.dataset.theme;

describe('AppThemeProvider', () => {
  let media: MockColorSchemeMedia;

  beforeEach(() => {
    media = withMockColorSchemeMedia(false);
    vi.mocked(useSettings).mockReturnValue(makeSettingsHook());
  });

  afterEach(() => {
    media.restore();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  test('applies a fixed palette to the tokens and to MUI', () => {
    preferMode(ThemeMode.Dark);

    renderApp();

    expect(documentTheme()).toBe('dark');
    expect(screen.getByTestId('mui')).toHaveTextContent(`dark ${PALETTES.dark['accent-primary']}`);
  });

  test('switches live when the preference changes', () => {
    preferMode(ThemeMode.Dark);
    const { rerender } = renderApp();

    preferMode(ThemeMode.Light);
    rerender(<AppThemeProvider><MuiMode /></AppThemeProvider>);

    expect(documentTheme()).toBe('light');
    expect(screen.getByTestId('mui')).toHaveTextContent(`light ${PALETTES.light['accent-primary']}`);
  });

  test('System follows the operating system, including when it changes', () => {
    preferMode(ThemeMode.System);
    renderApp();
    expect(documentTheme()).toBe('light');

    act(() => media.setPrefersDark(true));

    expect(documentTheme()).toBe('dark');
    expect(screen.getByTestId('mui')).toHaveTextContent('dark');
  });

  test('a fixed palette ignores operating system changes', () => {
    preferMode(ThemeMode.Light);
    renderApp();

    act(() => media.setPrefersDark(true));

    expect(documentTheme()).toBe('light');
  });

  test('mirrors the mode for the next boot once settings have loaded', () => {
    preferMode(ThemeMode.Light);

    renderApp();

    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe(ThemeMode.Light);
  });

  test('keeps the boot palette while settings load, rather than the defaults', () => {
    vi.mocked(useSettings).mockReturnValue(makeSettingsHook({ status: LoadingState.LOADING }));
    localStorage.setItem(THEME_MODE_STORAGE_KEY, ThemeMode.Light);
    media.setPrefersDark(true);
    preferMode(PREFERENCE_DEFAULTS.themeMode);

    renderApp();

    expect(documentTheme()).toBe('light');
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe(ThemeMode.Light);
  });
});
