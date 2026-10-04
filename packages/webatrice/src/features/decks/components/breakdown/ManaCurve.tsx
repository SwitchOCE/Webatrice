import { useTranslation } from 'react-i18next';

import { CURVE_BUCKETS } from '../../deckStats';

export function ManaCurve({ curve }: { curve: Record<number, number> }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...CURVE_BUCKETS.map((b) => curve[b] ?? 0));
  return (
    <div className="flex items-end gap-1 h-32">
      {CURVE_BUCKETS.map((b) => {
        const count = curve[b] ?? 0;
        const heightPct = (count / max) * 100;
        const bucket = b === 7 ? t('DeckBreakdown.curve.sevenPlus') : String(b);
        return (
          <div key={b} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <div className="text-[10px] text-text-muted tabular-nums h-3">
              {count > 0 ? count : ''}
            </div>
            <div
              className="w-full bg-gradient-to-t from-accent-secondary to-accent rounded-t"
              style={{ height: `${heightPct}%` }}
              title={t('DeckBreakdown.curve.barTitle', { count, cmc: bucket })}
            />
            <div className="text-xs text-text-muted tabular-nums">{bucket}</div>
          </div>
        );
      })}
    </div>
  );
}
