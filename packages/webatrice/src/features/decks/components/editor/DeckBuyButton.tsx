import { useMemo, useState } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  buildTcgMassEntryUrl,
  computeDeckPrice,
  pricingProgress,
  unpricedCards,
  type PriceLookup,
} from '../../pricing';
import type { DeckCard } from '../../types';

/** "Buy deck @ TCGplayer" pill under the deck header. Sums TCGplayer
 *  USD prices from the passed-in map (populated by the parent's
 *  Scryfall `/cards/collection` fetch) and links to TCGplayer's
 *  Mass Entry cart pre-filled with `qty NAME [SET] NUM` per row. */
export function DeckBuyButton({
  cards,
  prices,
  loading,
}: {
  cards: DeckCard[];
  prices: PriceLookup;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const { total, missing } = useMemo(
    () => computeDeckPrice(cards, prices),
    [cards, prices],
  );
  const href = useMemo(() => buildTcgMassEntryUrl(cards), [cards]);
  const disabled = cards.length === 0;
  const [showMissing, setShowMissing] = useState(false);

  const { pricedUnique, totalUnique } = useMemo(() => pricingProgress(cards, prices), [cards, prices]);
  const pendingUnique = Math.max(0, totalUnique - pricedUnique);

  const missingCards = useMemo(
    () => (loading ? [] : unpricedCards(cards, prices)),
    [cards, prices, loading],
  );

  const inner = (
    <>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <ShoppingCart size={13} />
        {t('DeckEditor.buy.deck')}
      </span>
      <span className="tabular-nums text-sm font-semibold flex items-center gap-1">
        {loading && <Loader2 size={11} className="animate-spin" />}
        ${total.toFixed(2)}
      </span>
    </>
  );

  const shared =
    'w-full inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border transition-colors';

  if (disabled) {
    return (
      <div
        className={`${shared} bg-accent-secondary/20 border-accent/20 text-text-muted cursor-not-allowed`}
        title={t('DeckEditor.buy.disabled')}
      >
        {inner}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={t('DeckEditor.buy.openDeck')}
        className={`${shared} bg-accent-secondary hover:bg-accent-secondary/90 border-accent/40 hover:border-accent text-white shadow-glow`}
      >
        {inner}
      </a>
      {loading && pendingUnique > 0 && (
        <div className="text-[10px] text-text-muted italic px-1 flex items-center gap-1.5">
          <Loader2 size={10} className="animate-spin shrink-0" />
          <span>
            {t('DeckEditor.buy.pricing', { count: pendingUnique, priced: String(pricedUnique), total: String(totalUnique) })}
          </span>
        </div>
      )}
      {!loading && missing > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowMissing((v) => !v)}
            className="w-full text-left text-[10px] text-text-muted italic px-1 hover:text-text-primary transition-colors"
            title={t('DeckEditor.buy.missingHint')}
          >
            {t(showMissing ? 'DeckEditor.buy.missingHide' : 'DeckEditor.buy.missingShow', { count: missing })}
          </button>
          {showMissing && (
            <ul
              className={[
                'max-h-40 overflow-y-auto text-[10px] text-text-secondary',
                'bg-bg-base border border-border-subtle rounded-md p-2 space-y-0.5',
              ].join(' ')}
            >
              {missingCards.map(({ name, qty }) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="tabular-nums text-text-muted w-5 text-right shrink-0">{qty}×</span>
                  <span className="flex-1 min-w-0 truncate">{name}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
