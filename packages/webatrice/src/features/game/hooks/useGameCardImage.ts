import { useEffect, useState } from 'react';

import {
  gameCardImageFallback, gameCardImageUrl, lookupGameCard, resolveGameImagePrinting, type GameImageCard, type GameImageLookup,
} from '../services/cardImages';

export function useGameCardImage(target: GameImageCard | null | undefined) {
  const name = target?.name;
  const wireId = target?.scryfallId || undefined;
  const [resolved, setResolved] = useState<{ name: string; lookup: GameImageLookup }>();
  const [failure, setFailure] = useState<{ primary: string | null; stage: number }>();
  useEffect(() => {
    if (!name) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retries = 0;
    const load = async () => {
      let lookup: GameImageLookup | undefined;
      try {
        lookup = await lookupGameCard(name);
        lookup = await resolveGameImagePrinting(lookup, wireId, name);
        if (!cancelled) {
          setResolved({ name, lookup });
          if (!gameCardImageUrl({ name, scryfallId: wireId }, lookup) && retries++ < 2) {
            timer = setTimeout(() => void load(), 30_000);
          }
        }
      } catch {
        if (!cancelled && retries++ < 2) {
          timer = setTimeout(() => void load(), 30_000);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, wireId]);
  const lookup = resolved && resolved.name === name ? resolved.lookup : undefined;
  const primary = target ? gameCardImageUrl(target, lookup) : null;
  const stage = failure?.primary === primary ? failure.stage : 0;
  useEffect(() => setFailure(undefined), [primary]);
  return {
    src: stage === 0 ? primary
      : stage === 1 ? gameCardImageFallback(primary) : null,
    onError: () => setFailure({ primary, stage: Math.min(stage + 1, 2) }),
  };
}
