import { useEffect, useMemo, useState } from 'react';

import { computeDeckPrice, emptyPriceLookup, fetchPricesForCards, type PriceLookup } from '../pricing';
import type { HydratedDeck } from '../types';

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

interface PriceState {
  priceKey: string;
  prices: PriceLookup;
  status: 'loading' | 'partial' | 'success' | 'failed';
}

export function useDeckPricing(
  deck: HydratedDeck | null,
  persistPrice: (priceUsd: number | undefined, priceMissingCount: number | undefined) => void,
): DeckPricing {
  const [state, setState] = useState<PriceState>(() => ({
    priceKey: '', prices: emptyPriceLookup(), status: 'loading',
  }));

  const priceKey = useMemo(() => deckPriceKey(deck), [deck]);

  useEffect(() => {
    if (!priceKey || !deck) {
      return;
    }
    let cancelled = false;
    setState({ priceKey, prices: emptyPriceLookup(), status: 'loading' });
    fetchPricesForCards(deck.cards, (partial) => {
      if (cancelled) {
        return;
      }
      setState({ priceKey, prices: partial, status: 'partial' });
    })
      .then((prices) => {
        if (cancelled) {
          return;
        }
        setState({ priceKey, prices, status: 'success' });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setState((current) => ({ ...current, status: 'failed' }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `priceKey` fingerprints the priced fields of `deck.cards`
  }, [priceKey]);

  useEffect(() => {
    if (!deck || state.priceKey !== priceKey || state.status !== 'success') {
      return;
    }
    const { total, missing } = computeDeckPrice(deck.cards, state.prices);
    if (missing === deck.cards.reduce((count, card) => count + card.quantity, 0)) {
      return;
    }
    persistPrice(
      Number(total.toFixed(2)),
      missing > 0 ? missing : undefined,
    );
  }, [deck, priceKey, state, persistPrice]);

  return {
    prices: state.priceKey === priceKey ? state.prices : emptyPriceLookup(),
    loading: Boolean(priceKey) && (state.priceKey !== priceKey || state.status === 'loading' || state.status === 'partial'),
  };
}
