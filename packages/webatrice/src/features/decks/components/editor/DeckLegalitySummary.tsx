import { useTranslation } from 'react-i18next';
import { Ban, CircleCheck, CircleHelp, Loader2 } from 'lucide-react';

import { formatDisplayLabel } from '../../deckSummary';
import type { DeckLegalityStatus } from '../../deckLegality';

export interface DeckLegalitySummaryProps {
  format: string;
  status: DeckLegalityStatus;
  illegalCount: number;
  unknownCount: number;
  loading: boolean;
}

/**
 * One line on the deck's legality in its format: legal, how many rows are
 * not, or that it can't be checked (a custom format, or no card data).
 */
export function DeckLegalitySummary({ format, status, illegalCount, unknownCount, loading }: DeckLegalitySummaryProps) {
  const { t } = useTranslation();
  if (status === 'none' && !loading) {
    return null;
  }
  const formatLabel = formatDisplayLabel(format);

  let line;
  if (loading) {
    line = (
      <span className="inline-flex items-center gap-1 text-text-muted">
        <Loader2 size={11} className="animate-spin" /> {t('DeckLegality.checking')}
      </span>
    );
  } else if (status === 'unavailable') {
    line = (
      <span className="inline-flex items-center gap-1 text-text-muted">
        <CircleHelp size={11} /> {t('DeckLegality.unavailable', { format: formatLabel })}
      </span>
    );
  } else if (status === 'illegal') {
    line = (
      <span className="inline-flex items-center gap-1 text-red-400">
        <Ban size={11} /> {t('DeckLegality.illegal', { count: illegalCount, format: formatLabel })}
      </span>
    );
  } else {
    line = (
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <CircleCheck size={11} /> {t('DeckLegality.legal', { format: formatLabel })}
      </span>
    );
  }

  return (
    <div className="text-xs" role="status">
      {line}
      {!loading && status !== 'unavailable' && unknownCount > 0 && (
        <div className="mt-0.5 text-text-muted">{t('DeckLegality.unchecked', { count: unknownCount })}</div>
      )}
    </div>
  );
}
