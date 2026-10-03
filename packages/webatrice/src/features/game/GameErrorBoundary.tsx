import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorBoundary, ErrorFallback } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';

/**
 * Contains a render crash inside a game (board or pre-start lobby) so it
 * doesn't take the page chrome down with it. The fallback keeps the Layout,
 * so the top bar and other tabs stay usable; the seat on the server is
 * untouched, and "Reload board" re-renders from the live game state.
 * Switching to another game clears the error.
 */
export default function GameErrorBoundary({ gameId, children }: { gameId: number | undefined; children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <ErrorBoundary
      name="game-board"
      resetKey={gameId}
      fallback={({ reset }) => (
        <Layout>
          <ErrorFallback
            title={t('GameErrorBoundary.title')}
            message={t('GameErrorBoundary.message')}
            retryLabel={t('GameErrorBoundary.retry')}
            onRetry={reset}
          />
        </Layout>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
