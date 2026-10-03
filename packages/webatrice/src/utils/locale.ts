import { DEFAULT_LANGUAGE, Language } from '@app/types';

/** Convert a Cockatrice/Transifex-style locale code (underscore, e.g. `pt_BR`,
 *  `en_US`) to a BCP-47 tag (hyphen, `pt-BR`) for JS `Intl` APIs, which throw
 *  `RangeError: Invalid language tag` on underscores. The underscore form stays
 *  canonical everywhere else (Language enum, localStorage `i18nextLng`, the
 *  `public/locales/<code>` directory names, Transifex). */
export const toBcp47 = (lng: string | undefined): string => (lng ?? '').replace(/_/g, '-');

/**
 * Where i18next's language detector reads (and, before the `language` preference existed,
 * cached) the UI language. The preference is mirrored here so the first paint is already in it.
 */
export const LANGUAGE_STORAGE_KEY = 'i18nextLng';

const LANGUAGES = Object.values(Language);

/**
 * Maps any locale tag — a browser's BCP-47 `navigator.language` (`pt-BR`, `de-AT`, `en`), a
 * legacy cached value (`en-US`), or a catalogue code (`pt_BR`) — onto the shipped catalogue
 * that serves it, or `undefined` when none does. An exact match wins (case- and
 * separator-insensitive); otherwise the base language picks its only catalogue, so `en-GB`
 * reads `en_US` and `pt-PT` reads `pt_BR`.
 */
export function resolveSupportedLanguage(tag: string | null | undefined): Language | undefined {
  if (!tag) {
    return undefined;
  }
  const normalized = tag.trim().replace(/-/g, '_').toLowerCase();
  const exact = LANGUAGES.find((language) => language.toLowerCase() === normalized);
  if (exact) {
    return exact;
  }
  const base = normalized.split('_')[0];
  return LANGUAGES.find((language) => language.toLowerCase().split('_')[0] === base);
}

/** Like `resolveSupportedLanguage`, falling back to the bundled English catalogue. */
export const toSupportedLanguage = (tag: string | null | undefined): Language =>
  resolveSupportedLanguage(tag) ?? DEFAULT_LANGUAGE;
