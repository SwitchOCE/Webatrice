import { ModuleType } from 'i18next';

class I18nBackend {
  static type: ModuleType = 'backend';
  static BASE_URL = `${import.meta.env.BASE_URL}locales`;

  read(
    language: string,
    namespace: string,
    callback: (error: unknown, data: unknown) => void,
  ) {
    // Started inside a promise so a browser without fetch (index.tsx then shows
    // the unsupported screen) falls back to the bundled English instead of throwing.
    Promise.resolve()
      .then(() => fetch(`${I18nBackend.BASE_URL}/${language}/${namespace}.json`))
      .then(resp => (resp.ok ? resp.json() : {}))
      .then(json => callback(null, json))
      .catch(error => callback(error, null));
  }
}

export default I18nBackend;
