import { useTranslation } from 'react-i18next';

import { getScryfallSymbolUrl } from '@app/services';

import { colorPieSlices } from '../../deckStats';
import { MANA_COLORS, type ManaColor } from '../../manaSymbols';

// Traditional MTG colors, tuned to read on the dark theme.
// (Black gets a lighter tone so it doesn't blend into the background.)
const PIE_HEX: Record<ManaColor, string> = {
  W: '#F8F0C4',
  U: '#4B92DB',
  B: '#4A3B60',
  R: '#E15C4F',
  G: '#4CA96A',
  C: '#B7B7C8',
};

const PIE_SIZE = 240;

const PIE_RADIUS = PIE_SIZE / 2;

export function ColorPie({ pips }: { pips: Record<ManaColor, number> }) {
  const { t } = useTranslation();
  const total = MANA_COLORS.reduce((s, c) => s + pips[c], 0);

  if (total === 0) {
    return (
      <div
        className="mx-auto rounded-full border border-border-subtle"
        style={{ width: PIE_SIZE, height: PIE_SIZE, background: 'rgb(var(--bg-elevated))' }}
      />
    );
  }

  const slices = colorPieSlices(pips, PIE_RADIUS);
  const legendColors = MANA_COLORS.filter((c) => pips[c] > 0);

  return (
    // 1fr auto 1fr keeps the pie perfectly centered while the legend
    // sits in the right-hand column, aligned to its left edge.
    <div className="grid items-center gap-6" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
      <div aria-hidden />
      <svg
        width={PIE_SIZE}
        height={PIE_SIZE}
        viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}
        className="shadow-glow rounded-full"
        role="img"
        aria-label={t('DeckBreakdown.pieLabel')}
      >
        {slices.map((s) => (
          <path
            key={s.color}
            d={s.path}
            fill={PIE_HEX[s.color]}
            stroke="rgb(var(--bg-base))"
            strokeWidth={slices.length > 1 ? 2 : 0}
          />
        ))}
      </svg>

      <div className="justify-self-start flex flex-col gap-2">
        {legendColors.map((c) => {
          const n = pips[c];
          const pct = (n / total) * 100;
          return (
            <div key={c} className="flex items-center gap-2 text-sm" title={t(`CardSearch.color.${c}`)}>
              <span
                className="h-3 w-3 rounded-sm border border-border-subtle shrink-0"
                style={{ backgroundColor: PIE_HEX[c] }}
              />
              <img
                src={getScryfallSymbolUrl(c)}
                alt={t(`CardSearch.color.${c}`)}
                className="w-5 h-5 shrink-0"
                draggable={false}
              />
              <span className="text-text-primary tabular-nums font-semibold">{n}</span>
              <span className="text-text-muted tabular-nums text-xs">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
