import { useEffect } from 'react';

export const APP_TITLE = 'Webatrice';

/**
 * Names the browser tab after the page on show (WCAG 2.4.2), the way a desktop
 * window title follows its active tab: `Room Main · Webatrice`. Null leaves the
 * bare app name.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_TITLE}` : APP_TITLE;
  }, [title]);
}
