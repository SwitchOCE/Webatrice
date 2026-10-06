import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { Language } from '@app/types';
import { LANGUAGE_STORAGE_KEY, resolveSupportedLanguage, toSupportedLanguage } from '@app/utils';
import { getSettings, usePreference, useSettings } from './useSettings';
import { LoadingState } from './useSharedStore';

function mirrorForBoot(language: Language | undefined): void {
  try {
    if (language) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } else {
      localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    }
  } catch {
    // Storage blocked: the preference still applies once settings load.
  }
}

export interface LanguagePreference {
  /** The catalogue the UI is showing now. */
  current: Language;
  /** Persists a choice (a `Language`, or '' to follow the browser); `useApplyLanguagePreference` then switches the UI live. */
  choose: (next: Language | '') => Promise<void>;
}

/** The UI language, and a setter for the preference (desktop General › Language). */
export function useLanguagePreference(): LanguagePreference {
  const { i18n } = useTranslation();
  const { update } = useSettings();

  const choose = useCallback(async (next: Language | '') => {
    // Pickers can render before the settings row loads (the login page); wait for it.
    await getSettings();
    await update({ language: next });
  }, [update]);

  return {
    current: toSupportedLanguage(i18n.resolvedLanguage ?? i18n.language),
    choose,
  };
}

/**
 * Keeps i18next on the persisted language preference, switching live when it changes. Mount
 * once, at the app root. Waits for the settings row, so the defaults it reports while loading
 * never override the language the detector booted with.
 */
export function useApplyLanguagePreference(): void {
  const { i18n } = useTranslation();
  const ready = useSettings().status === LoadingState.READY;
  const preference = usePreference('language');
  const applied = useRef<Language | undefined | null>(null);
  const version = useRef(0);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const chosen = resolveSupportedLanguage(preference);
    const current = ++version.current;
    const previous = applied.current;
    applied.current = chosen;
    mirrorForBoot(chosen);

    if (chosen) {
      // Load without changing the active language; a newer choice supersedes this load.
      // Apply even the current language: an earlier change may still be in flight.
      void i18n.loadLanguages(chosen).then(() => {
        if (current === version.current) {
          return i18n.changeLanguage(chosen);
        }
      });
    } else if (previous) {
      // Back to "follow the browser": run detection again now that nothing is cached.
      void i18n.changeLanguage();
    }
    return () => {
      version.current = current + 1;
    };
  }, [ready, preference, i18n]);
}
