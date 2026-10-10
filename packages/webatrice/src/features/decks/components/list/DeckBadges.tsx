import { useTranslation } from 'react-i18next';

import { bracketToneClass } from '@app/utils';

export function BracketBadge({ level }: { level: number }) {
  const { t } = useTranslation();
  return (
    <span
      className={[
        'inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-xs font-bold tabular-nums shrink-0',
        bracketToneClass(level),
      ].join(' ')}
      title={t('Decks.badge.bracket', { level })}
    >
      {t('Decks.badge.bracketShort', { level })}
    </span>
  );
}

export function DeckPriceBadge({
  price,
}: {
  price: { usd?: number; missing?: number } | undefined;
}) {
  const { t } = useTranslation();
  if (price === undefined) {
    return (
      <span
        className="text-xs tabular-nums text-text-muted opacity-50"
        title={t('Decks.badge.priceLoading')}
      >
        · · ·
      </span>
    );
  }
  if (price.usd == null) {
    return (
      <span
        className="text-xs tabular-nums text-text-muted"
        title={t('Decks.badge.priceNone')}
      >
        —
      </span>
    );
  }
  const suffix = price.missing && price.missing > 0 ? '+' : '';
  const title =
    price.missing && price.missing > 0
      ? t('Decks.badge.priceTotalMissing', { count: price.missing })
      : t('Decks.badge.priceTotal');
  return (
    <span
      className="text-xs tabular-nums text-success font-medium"
      title={title}
    >
      ${price.usd.toFixed(2)}{suffix}
    </span>
  );
}
