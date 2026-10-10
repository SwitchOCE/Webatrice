import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import ErrorBoundary from './ErrorBoundary';
import ErrorFallback from './ErrorFallback';

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
