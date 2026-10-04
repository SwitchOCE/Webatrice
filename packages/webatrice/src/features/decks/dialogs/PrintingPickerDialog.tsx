import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleAlert, Loader2, X } from 'lucide-react';

import type { PrintingSummary } from '@app/services';

import { useCardPrintings } from '../hooks/useCardPrintings';
import { upgradeScryfallImageSize } from '../scryfallImage';
import type { DeckCard } from '../types';
import { DeckDialogFrame } from './DeckDialogFrame';

/**
 * The row whose printing is being changed. Held as `{ index, card }` so
 * the dialog shows the card as it was when the picker opened.
 */
export interface PrintingRequest {
  index: number;
  card: DeckCard;
}

/**
 * Lists every printing of the requested card; picking one hands its
 * `PrintingSummary` to `onPick`, which the editor applies to the row
 * (set, collector number, scryfallId, image) for the autosave to persist.
 */
export function PrintingPickerDialog({
  request,
  onClose,
  onPick,
}: {
  request: PrintingRequest | null;
  onClose: () => void;
  onPick: (printing: PrintingSummary) => void;
}) {
  const { t } = useTranslation();
  // Keyed on the card name, so a fresh `request` object for the same
  // card doesn't refetch.
  const { printings, loading, error, prices } = useCardPrintings(request?.card.name);
  const titleId = useId();

  if (!request) {
    return null;
  }
  const currentId = request.card.scryfallId;

  return (
    <DeckDialogFrame onClose={onClose} titleId={titleId}>
      <div
        className={[
          'relative w-full max-w-5xl rounded-xl bg-bg-surface border',
          'border-border-subtle shadow-glow p-6 max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          aria-label={t('Common.action.close')}
        >
          <X size={18} />
        </button>

        <div>
          <h2 id={titleId} className="font-modern text-xl font-semibold text-text-primary truncate">
            {t('PrintingPicker.title')}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {request.card.name}
            {!loading && printings.length > 0 && (
              <span className="ml-2 text-text-muted">
                · {t('PrintingPicker.count', { count: printings.length })}
              </span>
            )}
          </p>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center py-16 text-text-muted text-sm">
            <Loader2 size={18} className="animate-spin mr-2 text-accent" /> {t('PrintingPicker.loading')}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-danger bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
            <CircleAlert size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && printings.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-16 text-text-muted text-sm">
            {t('PrintingPicker.empty')}
          </div>
        )}

        {!loading && !error && printings.length > 0 && (
          <div data-dialog-content className="mt-4 flex-1 overflow-y-auto pr-1">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
            >
              {printings.map((p, i) => {
                const img = upgradeScryfallImageSize(p.imageUri);
                const isCurrent = p.scryfallId != null && p.scryfallId === currentId;
                return (
                  <button
                    key={p.scryfallId ?? `${p.set}-${p.collectorNumber}-${i}`}
                    type="button"
                    onClick={() => onPick(p)}
                    className={[
                      'rounded-lg overflow-hidden border transition-all group relative bg-bg-base text-left',
                      isCurrent
                        ? 'border-accent ring-2 ring-accent/50'
                        : 'border-border-subtle hover:border-accent hover:shadow-glow',
                    ].join(' ')}
                    title={`${p.set?.toUpperCase() ?? '?'} · ${request.card.name}`}
                  >
                    <div className="aspect-[5/7] w-full">
                      {img ? (
                        <img
                          src={img}
                          alt={`${request.card.name} (${p.set ?? ''})`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-text-muted p-2 text-center">
                          {request.card.name}
                        </div>
                      )}
                    </div>
                    <div
                      className={[
                        'px-2 py-1.5 text-xs flex items-center',
                        'justify-between gap-1 border-t border-border-subtle bg-bg-surface',
                      ].join(' ')}
                    >
                      <span className="font-medium text-text-primary uppercase tracking-wider truncate">
                        {p.set ?? '—'}
                      </span>
                      {(() => {
                        const usd = p.scryfallId ? prices.byId.get(p.scryfallId)?.usd : undefined;
                        return (
                          <span
                            className={[
                              'tabular-nums shrink-0',
                              usd != null ? 'text-success font-medium' : 'text-text-muted',
                            ].join(' ')}
                            title={usd != null ? t('PrintingPicker.priceUsd') : t('PrintingPicker.noPrice')}
                          >
                            {usd != null ? `$${usd.toFixed(2)}` : '—'}
                          </span>
                        );
                      })()}
                      {p.collectorNumber && (
                        <span className="text-text-muted tabular-nums shrink-0">
                          #{p.collectorNumber}
                        </span>
                      )}
                    </div>
                    {isCurrent && (
                      <div
                        className={[
                          'absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5',
                          'rounded bg-accent text-white text-[10px] font-semibold shadow-glow',
                        ].join(' ')}
                      >
                        <CheckCircle2 size={10} /> {t('PrintingPicker.current')}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DeckDialogFrame>
  );
}
