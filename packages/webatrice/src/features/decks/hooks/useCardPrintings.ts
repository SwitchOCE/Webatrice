import { useEffect, useState } from 'react';

import { fetchAllPrintings, lookupCard, type PrintingSummary } from '@app/services';

import { emptyPriceLookup, fetchPricesForCards, type PriceLookup } from '../pricing';

export interface CardPrintings {
  printings: PrintingSummary[];
  loading: boolean;
  error: string | null;
  /** Per-printing prices, keyed by scryfallId; they stream in after the list. */
  prices: PriceLookup;
}

/**
 * Every printing of `cardName` for the printings picker. Scryfall's
 * `unique=prints` search is the source of truth — the local card
 * database usually knows a single printing, which would wrongly suggest
 * there is nothing to choose from — with the catalog's printings as the
 * offline fallback. Prices load after the list so the grid paints first.
 * Reloads only when the card name changes; `undefined` loads nothing.
 */
export function useCardPrintings(cardName: string | undefined): CardPrintings {
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
          // Scryfall miss (offline / unknown card): show what the
          // catalog has so the picker isn't empty.
          const local = await lookupCard(cardName);
          if (cancelled) {
            return;
          }
          resolved = local.printings;
        }
        setPrintings(resolved);
        setLoading(false);

        // The shared pricing cache means printings seen before show
        // their prices immediately.
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
        setError(e instanceof Error ? e.message : 'Failed to load printings');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardName]);

  return { printings, loading, error, prices };
}
