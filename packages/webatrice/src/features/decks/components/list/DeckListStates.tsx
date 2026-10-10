import { CircleAlert, FileText, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const NEW_DECK_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-accent '
  + 'text-white hover:bg-accent-hover shadow-glow disabled:opacity-40 '
  + 'disabled:cursor-not-allowed transition-colors';

export function NewDeckButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={NEW_DECK_BUTTON_CLASS}>
      <Plus size={14} /> {t('Decks.list.newDeck')}
    </button>
  );
}

export function DeckListLoading() {
  const { t } = useTranslation();
  return (
    <div className="h-full min-h-[240px] flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin text-accent" />
        {t('Decks.list.loading')}
      </div>
    </div>
  );
}

export function DeckListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="h-full min-h-[240px] flex items-center justify-center">
      <div role="alert" className="flex flex-col items-center gap-3 text-sm text-text-muted text-center max-w-sm">
        <span className="inline-flex items-center gap-2">
          <CircleAlert size={16} className="text-danger" />
          {message}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className={[
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md',
            'border border-border-subtle text-text-primary hover:bg-bg-elevated',
          ].join(' ')}
        >
          <RefreshCw size={14} /> {t('Decks.retry')}
        </button>
      </div>
    </div>
  );
}

export function DeckStorageError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-danger"
    >
      <CircleAlert size={16} className="shrink-0 mt-0.5 text-danger" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('Decks.dismiss')}
        className="shrink-0 rounded p-0.5 text-danger hover:bg-red-500/15"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function DeckListEmpty({ onCreate, disabled }: { onCreate: () => void; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="h-full min-h-[280px] flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-bg-elevated border border-border-subtle mb-3">
          <FileText size={20} className="text-accent" />
        </div>
        <div className="text-text-primary font-medium">{t('Decks.list.emptyTitle')}</div>
        <div className="text-sm text-text-muted mt-1 mb-4">{t('Decks.list.emptyBody')}</div>
        <NewDeckButton onClick={onCreate} disabled={disabled} />
      </div>
    </div>
  );
}
