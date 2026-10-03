import { useMemo } from 'react';
import { ScryfallImageSize } from '@cockatrice/datatrice';
import { getScryfallUrl } from '@app/services';

export interface ScryfallCard {
  smallUrl: string | null;
  normalUrl: string | null;
  ready: boolean;
}

interface CardLike {
  providerId?: string;
  name?: string;
}

export function useScryfallCard(card: CardLike | null | undefined): ScryfallCard {
  // Key on the identifying fields so a fresh `card` object for the same
  // printing doesn't rebuild the URLs. No card resolves to null URLs.
  const providerId = card?.providerId;
  const name = card?.name;
  return useMemo<ScryfallCard>(() => {
    const smallUrl = getScryfallUrl({ providerId, name }, ScryfallImageSize.Small);
    const normalUrl = getScryfallUrl({ providerId, name }, ScryfallImageSize.Normal);
    return {
      smallUrl,
      normalUrl,
      ready: smallUrl != null,
    };
  }, [providerId, name]);
}
