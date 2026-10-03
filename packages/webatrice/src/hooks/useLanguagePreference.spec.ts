import { act, renderHook } from '@testing-library/react';

import { Language, PREFERENCE_DEFAULTS } from '@app/types';
import { makeSettingsHook } from './__mocks__/useSettings';
import { LANGUAGE_STORAGE_KEY } from '@app/utils';
import { useApplyLanguagePreference, useLanguagePreference } from './useLanguagePreference';
import { getSettings, usePreferences, useSettings } from './useSettings';
import { LoadingState } from './useSharedStore';

vi.mock('./useSettings');

const mockI18n = {
  language: 'en_US',
  resolvedLanguage: 'en_US' as string | undefined,
  changeLanguage: vi.fn(),
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: mockI18n }),
}));

const preferLanguage = (language: string) => {
  vi.mocked(usePreferences).mockReturnValue({ ...PREFERENCE_DEFAULTS, language });
};

describe('useApplyLanguagePreference', () => {
  beforeEach(() => {
    mockI18n.language = 'en_US';
    localStorage.clear();
    vi.mocked(useSettings).mockReturnValue(makeSettingsHook());
  });

  test('waits for the settings row before touching the language', () => {
    vi.mocked(useSettings).mockReturnValue(makeSettingsHook({ status: LoadingState.LOADING }));
    preferLanguage('fr');

    renderHook(() => useApplyLanguagePreference());

    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  test('switches to the stored language and mirrors it for the next boot', () => {
    preferLanguage('fr');

    renderHook(() => useApplyLanguagePreference());

    expect(mockI18n.changeLanguage).toHaveBeenCalledWith(Language.fr);
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(Language.fr);
  });

  test('switches live when the preference changes', () => {
    preferLanguage('fr');
    const { rerender } = renderHook(() => useApplyLanguagePreference());
    mockI18n.language = Language.fr;

    preferLanguage('pt_BR');
    rerender();

    expect(mockI18n.changeLanguage).toHaveBeenLastCalledWith(Language.pt_BR);
  });

  test('re-detects from the browser when the choice is cleared', () => {
    preferLanguage('de');
    const { rerender } = renderHook(() => useApplyLanguagePreference());

    preferLanguage('');
    rerender();

    expect(mockI18n.changeLanguage).toHaveBeenLastCalledWith();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  test('leaves the detected language alone when following the browser from the start', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en-US');
    preferLanguage('');

    renderHook(() => useApplyLanguagePreference());

    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });
});

describe('useLanguagePreference', () => {
  test('reports the active catalogue, normalising a BCP-47 tag', () => {
    mockI18n.resolvedLanguage = 'pt-BR';

    const { result } = renderHook(() => useLanguagePreference());

    expect(result.current.current).toBe(Language.pt_BR);
    mockI18n.resolvedLanguage = 'en_US';
  });

  test('persists a choice once the settings row has loaded', async () => {
    const hook = makeSettingsHook();
    vi.mocked(useSettings).mockReturnValue(hook);

    const { result } = renderHook(() => useLanguagePreference());
    await act(() => result.current.choose(Language.ru));

    expect(getSettings).toHaveBeenCalled();
    expect(hook.update).toHaveBeenCalledWith({ language: Language.ru });
  });
});
