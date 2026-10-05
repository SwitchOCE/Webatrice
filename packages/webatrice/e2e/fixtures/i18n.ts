import i18next, { type TOptions } from 'i18next';
import ICU from 'i18next-icu';

import english from '../../src/i18n-default.json';

/** The same English ICU catalogue loaded by the application under test. */
const i18n = i18next.createInstance();
void i18n.use(ICU).init({
  lng: 'en',
  fallbackLng: 'en',
  initAsync: false,
  resources: { en: { translation: english } },
  interpolation: { escapeValue: false },
});

/** Resolve an accessible name from its product translation key. */
export function t(key: string, options?: TOptions): string {
  return i18n.t(key, options) as string;
}
