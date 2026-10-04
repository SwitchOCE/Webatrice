import { ImageOff, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { priceForCard, type PriceLookup } from '../../pricing';
import { upgradeScryfallImageSize } from '../../scryfallImage';
import type { DeckCard } from '../../types';

export function DeckCardPreview({
  card,
  prices,
}: {
  card: DeckCard | null;
  prices: PriceLookup;
}) {
  const { t } = useTranslation();
  const imageUri = card ? upgradeScryfallImageSize(card.imageUri) : null;

  // Shared frame: `aspect-[5/7]` + `rounded-xl` + `shadow-glow` matches
  // fancy webatrice's CardImagePreview so the empty state carries the
  // same accent aura as a rendered card image. Empty state uses
  // `border-strong` so there's a visible edge without the natural
  // dark border of a Scryfall card image to define the frame; a
  // loaded card falls back to the subtler `border-subtle` fancy uses.
  const borderClass = card ? 'border-border-subtle' : 'border-border-strong';
  return (
    <div className="w-full max-w-[300px] mx-auto">
      <div
        className={[
          'aspect-[5/7] w-full rounded-xl overflow-hidden bg-bg-elevated border',
          borderClass,
          'shadow-glow flex items-center justify-center',
        ].join(' ')}
      >
        {imageUri ? (
          <img
            src={imageUri}
            alt={card?.name ?? ''}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : card ? (
          <div className="text-xs text-text-muted text-center px-4 flex flex-col items-center gap-2">
            <ImageOff size={20} />
            {t('DeckEditor.preview.noImage')}
          </div>
        ) : (
          <div className="text-xs text-text-muted italic text-center px-4">
            {t('DeckEditor.preview.hover')}
          </div>
        )}
      </div>
      {card && (
        <>
          <div className="mt-3 text-center text-sm font-medium text-text-primary truncate">
            {card.name}
          </div>
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <CardPricePill card={card} prices={prices} />
          </div>
        </>
      )}
    </div>
  );
}

/** Per-card TCGplayer buy pill under the sidebar preview. Reads from
 *  the same shared price map the deck total uses — no extra network
 *  call. Non-interactive fallback when Scryfall has no price or no
 *  affiliate URL for this printing. */
function CardPricePill({
  card,
  prices,
}: {
  card: DeckCard;
  prices: PriceLookup;
}) {
  const { t } = useTranslation();
  const info = priceForCard(prices, card);
  const usd = info?.usd;
  const href = info?.tcgplayer ?? null;

  const inner = (
    <>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <ShoppingCart size={13} />
        {t('DeckEditor.buy.card')}
      </span>
      <span className="tabular-nums text-sm font-semibold">
        {usd != null ? `$${usd.toFixed(2)}` : '—'}
      </span>
    </>
  );

  const shared =
    'w-full inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border transition-colors';

  if (!href) {
    return (
      <div className={`${shared} bg-accent-secondary/30 border-accent/30 text-text-primary`}>
        {inner}
      </div>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={t('DeckEditor.buy.openCard')}
      className={`${shared} bg-accent-secondary/50 hover:bg-accent-secondary border-accent/40 hover:border-accent text-white shadow-glow`}
    >
      {inner}
    </a>
  );
}
