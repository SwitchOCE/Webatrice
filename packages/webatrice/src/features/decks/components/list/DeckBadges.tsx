import { bracketToneClass } from '@app/services';

export function BracketBadge({ level }: { level: number }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-xs font-bold tabular-nums shrink-0',
        bracketToneClass(level),
      ].join(' ')}
      title={`Commander Bracket ${level}`}
    >
      B{level}
    </span>
  );
}

/**
 * USD pill on a deck row: loading (dots) until the deck's XML lands, a
 * dash when the deck has no cached price, else `$X.XX` with a `+` when
 * some cards had no price on file.
 */
export function DeckPriceBadge({
  price,
}: {
  price: { usd?: number; missing?: number } | undefined;
}) {
  if (price === undefined) {
    return (
      <span
        className="text-xs tabular-nums text-text-muted opacity-50"
        title="Loading price…"
      >
        · · ·
      </span>
    );
  }
  if (price.usd == null) {
    return (
      <span
        className="text-xs tabular-nums text-text-muted"
        title="No cached price — open the deck to compute it"
      >
        —
      </span>
    );
  }
  const suffix = price.missing && price.missing > 0 ? '+' : '';
  const title =
    price.missing && price.missing > 0
      ? `TCGplayer USD total. ${price.missing} card${price.missing === 1 ? '' : 's'} had no price on file — actual total is higher.`
      : 'TCGplayer USD total';
  return (
    <span
      className="text-xs tabular-nums text-success font-medium"
      title={title}
    >
      ${price.usd.toFixed(2)}{suffix}
    </span>
  );
}
