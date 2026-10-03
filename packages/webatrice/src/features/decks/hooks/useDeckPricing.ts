import { useEffect, useMemo, useState } from 'react';

import { computeDeckPrice, emptyPriceLookup, fetchPricesForCards, type PriceLookup } from '../pricing';
import type { HydratedDeck } from '../types';

/**
 * Identity of the priced cards: a scryfallId when known, else the
 * lower-cased name (bare Cockatrice entries). Quantity-only edits keep
 * the same key, so they re-total locally without a refetch.
 */
export function deckPriceKey(deck: HydratedDeck | null): string {
  if (!deck) {
    return '';
  }
  const tokens = deck.cards.map((c) =>
    c.scryfallId ? `id:${c.scryfallId}` : `name:${c.name.toLowerCase()}`,
  );
  return Array.from(new Set(tokens)).sort().join('|');
}

export interface DeckPricing {
  prices: PriceLookup;
  loading: boolean;
}

/**
 * TCGplayer prices for the open deck, from Scryfall. Refetches when a
 * card is added, removed or re-printed; partial results stream in so
 * the sidebar total counts up chunk by chunk. Once prices settle the
 * total is written back to the deck (`persistPrice`), which skips
 * unchanged values so this can't start a save loop.
 */
export function useDeckPricing(
  deck: HydratedDeck | null,
  persistPrice: (priceUsd: number | undefined, priceMissingCount: number | undefined) => void,
): DeckPricing {
  // `pricing.ts` keeps its own session cache; this state copy is what
  // re-renders the editor as prices land.
  const [prices, setPrices] = useState<PriceLookup>(() => emptyPriceLookup());
  const [loading, setLoading] = useState(false);

  const priceKey = useMemo(() => deckPriceKey(deck), [deck]);

  useEffect(() => {
    if (!priceKey || !deck) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchPricesForCards(deck.cards, (partial) => {
      if (cancelled) {
        return;
      }
      setPrices(partial);
    })
      .then(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `priceKey` fingerprints the priced fields of `deck.cards`
  }, [priceKey]);

  // Cache the settled total on the deck so MyDecks (and the lobby) can
  // show it without repricing.
  useEffect(() => {
    if (!deck || loading) {
      return;
    }
    const { total, missing } = computeDeckPrice(deck.cards, prices);
    persistPrice(
      total > 0 ? Number(total.toFixed(2)) : undefined,
      missing > 0 ? missing : undefined,
    );
  }, [deck, prices, loading, persistPrice]);

  return { prices, loading };
}
