import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import ErrorBoundary from './ErrorBoundary';
import ErrorFallback from './ErrorFallback';

/**
 * Route-level crash containment for the AppShell: a page that throws while
 * rendering shows a recovery panel instead of white-screening the whole app.
 * Navigating to another route clears the error.
 */
export default function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  return (
    <ErrorBoundary
      name="route"
      resetKey={pathname}
      fallback={({ reset }) => (
        <ErrorFallback
          title={t('ErrorFallback.route.title')}
          message={t('ErrorFallback.route.message')}
          retryLabel={t('ErrorFallback.route.retry')}
          onRetry={reset}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
