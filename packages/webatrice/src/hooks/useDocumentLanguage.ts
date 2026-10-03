import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { toBcp47 } from '@app/utils';

/**
 * Keeps `<html lang>` on the UI language (WCAG 3.1.1), so screen readers pick
 * the right voice and browsers the right hyphenation and spelling. index.html
 * ships `lang="en"`; the catalogue codes are Transifex style (`pt_BR`), so the
 * attribute gets the BCP-47 form (`pt-BR`).
 */
export function useDocumentLanguage(): void {
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language) {
      document.documentElement.lang = toBcp47(i18n.language);
    }
  }, [i18n.language]);
}
