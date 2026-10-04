import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Loader2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { AuthGuard } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';
import { RouteEnum } from '@app/types';

/**
 * Placeholder UI shown while the deck is hydrating and while its card
 * images preload. Mirrors the real DeckEditor's 360px sidebar + main
 * grid so the layout doesn't jump when the real content lands. Progress
 * line only renders once the preload total is known (>0) — the initial
 * hydration phase has nothing to count yet.
 */
export function DeckEditorSkeleton({ loaded, total }: { loaded: number; total: number }) {
  const { t } = useTranslation();
  return (
    <Layout>
      <AuthGuard />
      <div
        className="h-full grid bg-bg-base bg-purple-radial"
        style={{ gridTemplateColumns: '360px 1fr' }}
      >
        {/* Sidebar skeleton */}
        <div className="border-r border-border-subtle bg-bg-surface p-4 flex flex-col gap-4">
          <div className="h-7 w-3/4 rounded bg-bg-elevated animate-pulse" />
          <div className="h-4 w-1/3 rounded bg-bg-elevated animate-pulse" />
          <div className="w-full max-w-[300px] mx-auto aspect-[5/7] rounded-xl bg-bg-elevated animate-pulse" />
          <div className="h-4 w-1/2 mx-auto rounded bg-bg-elevated animate-pulse" />
          <div className="h-9 w-full rounded-md bg-bg-elevated animate-pulse" />
          <div className="mt-auto flex items-center justify-center gap-2 text-xs text-text-muted italic">
            <Loader2 size={12} className="animate-spin text-accent" />
            {total > 0
              ? t('DeckEditor.shell.preloading', { loaded: String(loaded), total: String(total) })
              : t('DeckEditor.shell.loadingDeck')}
          </div>
        </div>
        {/* Main pane skeleton */}
        <div className="p-6 flex flex-col gap-4">
          <div className="h-10 w-full max-w-md rounded-md bg-bg-elevated animate-pulse" />
          <div className="flex flex-col gap-3 mt-2">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-6 rounded bg-bg-elevated animate-pulse" />
                <div
                  className="h-4 rounded bg-bg-elevated animate-pulse"
                  style={{ width: `${55 + ((i * 7) % 35)}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function DeckNotFound({ reason }: { reason: string | null }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <Layout>
      <AuthGuard />
      <div className="h-full flex flex-col items-center justify-center bg-bg-base gap-3">
        <CircleAlert size={32} className="text-danger" />
        <div className="text-text-primary font-medium">
          {reason ? t('DeckEditor.loadFailedTitle') : t('DeckEditor.shell.notFoundTitle')}
        </div>
        <div className="text-sm text-text-muted">
          {reason ?? t('DeckEditor.shell.notFoundBody')}
        </div>
        <button
          type="button"
          onClick={() => navigate(RouteEnum.DECKS)}
          className={[
            'mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm',
            'font-semibold bg-accent text-white hover:bg-accent-hover shadow-glow transition-colors',
          ].join(' ')}
        >
          <ArrowLeft size={14} /> {t('DeckEditor.shell.backToDecks')}
        </button>
      </div>
    </Layout>
  );
}

export function EmptyCardsHint({ isMtg }: { isMtg: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="text-sm text-text-muted italic text-center mt-6 mb-24">
        <Trans
          i18nKey={isMtg ? 'DeckEditor.shell.emptyMtg' : 'DeckEditor.shell.emptyPlain'}
          components={{ hl: <span className="font-semibold text-text-primary" /> }}
        />
      </div>
      <div className="text-center text-text-muted">
        <div className="text-sm">{t('DeckEditor.shell.noCards')}</div>
      </div>
    </>
  );
}
