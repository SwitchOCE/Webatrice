import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchAllPrintings, lookupCard, type PrintingSummary } from '@app/services';

import { emptyPriceLookup, fetchPricesForCards, type PriceLookup } from '../pricing';

export interface CardPrintings {
  printings: PrintingSummary[];
  loading: boolean;
  error: string | null;
  prices: PriceLookup;
}

export function useCardPrintings(cardName: string | undefined): CardPrintings {
  const { t } = useTranslation();
  const [printings, setPrintings] = useState<PrintingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<PriceLookup>(() => emptyPriceLookup());

  useEffect(() => {
    if (cardName === undefined) {
      return;
    }
    setPrintings([]);
    setPrices(emptyPriceLookup());
    setError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const scryfall = await fetchAllPrintings(cardName);
        if (cancelled) {
          return;
        }
        let resolved: PrintingSummary[];
        if (scryfall.length > 0) {
          resolved = scryfall;
        } else {
          const local = await lookupCard(cardName);
          if (cancelled) {
            return;
          }
          resolved = local.printings;
        }
        setPrintings(resolved);
        setLoading(false);

        const cards = resolved
          .filter((p) => p.scryfallId)
          .map((p) => ({ scryfallId: p.scryfallId!, name: cardName }));
        if (cards.length > 0) {
          fetchPricesForCards(cards)
            .then((lookup) => {
              if (cancelled) {
                return;
              }
              setPrices(lookup);
            })
            .catch(() => {
              /* silent — tiles just render without a price */
            });
        }
      } catch (e) {
        if (cancelled) {
          return;
        }
        setError(e instanceof Error ? e.message : t('PrintingPicker.loadFailed'));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardName, t]);

  return { printings, loading, error, prices };
}
