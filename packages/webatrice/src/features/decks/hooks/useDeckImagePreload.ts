import { useEffect, useRef, useState } from 'react';

import { previewImageUrls } from '../scryfallImage';
import type { HydratedDeck } from '../types';

/**
 * Preloads every card's sidebar-preview image ahead of first hover so
 * the CardPreview `<img>` mounts hit the browser HTTP cache instantly
 * instead of triggering a fresh Scryfall CDN fetch (which was the
 * "hovering feels laggy" symptom on cold decks).
 *
 * The preload runs exactly once per `deckId` — a value guard on
 * `readyDeckId` prevents subsequent card additions / printing swaps
 * from re-blocking the UI. A card added after the initial preload
 * fetches its image the normal way when its `<img>` first mounts;
 * only navigating to a different deck resets the gate.
 *
 * URLs are `upgradeScryfallImageSize`-normalized to match the exact
 * strings the sidebar `<img src>` will request, so the browser sees
 * a cache hit (not a similar-but-different URL). Errors count as done
 * so a single 404 on a Scryfall-unknown card doesn't stall the deck.
 */
export interface PreloadProgress {
  ready: boolean;
  loaded: number;
  total: number;
}

export function useDeckImagePreload(
  deckId: number | null,
  deck: HydratedDeck | null,
  loading: boolean,
): PreloadProgress {
  const [readyDeckId, setReadyDeckId] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number }>({
    loaded: 0,
    total: 0,
  });

  // Snapshot the deck in a ref so a mid-preload mutation (user hits
  // + on a card row before all images have landed) doesn't trigger
  // the effect and cancel the in-flight preload half-way through.
  const deckRef = useRef(deck);
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  useEffect(() => {
    if (loading || deckId == null) {
      return;
    }
    if (readyDeckId === deckId) {
      return;
    }
    const snapshot = deckRef.current;
    if (!snapshot) {
      return;
    }

    const urls = previewImageUrls(snapshot.cards);

    if (urls.length === 0) {
      setProgress({ loaded: 0, total: 0 });
      setReadyDeckId(deckId);
      return;
    }

    setProgress({ loaded: 0, total: urls.length });

    let cancelled = false;
    let loaded = 0;
    const tick = () => {
      if (cancelled) {
        return;
      }
      loaded += 1;
      setProgress({ loaded, total: urls.length });
      if (loaded === urls.length) {
        setReadyDeckId(deckId);
      }
    };

    urls.forEach((url) => {
      const img = new Image();
      img.onload = tick;
      img.onerror = tick;
      img.src = url;
    });

    return () => {
      cancelled = true;
    };
  }, [deckId, loading, readyDeckId]);

  return {
    ready: readyDeckId === deckId,
    loaded: progress.loaded,
    total: progress.total,
  };
}
