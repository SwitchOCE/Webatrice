import { useEffect, useRef, useState } from 'react';

import {
  detailTargetKey,
  fetchScryfallDetail,
  type BrowsedCard,
  type DetailTarget,
  type ScryfallDetail,
} from '../cardDetail';
import type { DeckCard } from '../types';

export interface CardDetailState {
  /** Scryfall record for the shown card; `null` while loading or on failure. */
  detail: ScryfallDetail | null;
  detailLoading: boolean;
  /** The related card being browsed instead of the clicked row, if any. */
  browsed: BrowsedCard | null;
  /** The related-card chip whose details are being fetched. */
  pending: DetailTarget | null;
  /** Browse to a related card once its details have loaded. */
  browse: (next: BrowsedCard) => void;
  /** Return to the clicked row. */
  back: () => void;
}

/**
 * Detail data for the card-detail dialog: the clicked row's Scryfall
 * record, or a related card (token, meld piece, combo piece, other face)
 * browsed from it. Opening a different row starts fresh.
 *
 * Browsing is fetch-first-then-swap: the chip shows a spinner while its
 * record loads, then the browsed card and its record replace the view in
 * one commit, so the dialog never flashes an empty frame. A click on
 * another chip before the first resolves wins.
 */
export function useCardDetail(snapshot: DeckCard | null): CardDetailState {
  const [detail, setDetail] = useState<ScryfallDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [browsed, setBrowsed] = useState<BrowsedCard | null>(null);
  const [pending, setPending] = useState<DetailTarget | null>(null);
  // Read by the async browse fetch to drop a superseded click.
  const pendingRef = useRef<DetailTarget | null>(null);
  pendingRef.current = pending;

  const snapshotKey = snapshot ? `${snapshot.name}::${snapshot.category}` : null;
  useEffect(() => {
    setBrowsed(null);
  }, [snapshotKey]);

  const target: DetailTarget | null = browsed ?? (snapshot
    ? { name: snapshot.name, scryfallId: snapshot.scryfallId }
    : null);
  const targetKey = target ? detailTargetKey(target) : null;

  useEffect(() => {
    if (!target) {
      setDetail(null);
      return;
    }
    setDetail(null);
    setDetailLoading(true);
    const controller = new AbortController();
    fetchScryfallDetail(target.scryfallId, target.name, controller.signal)
      .then((data) => {
        setDetail(data);
        setDetailLoading(false);
      })
      .catch((e) => {
        if ((e as { name?: string })?.name === 'AbortError') {
          return;
        }
        setDetailLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the card identity (`targetKey`) changes
  }, [targetKey]);

  const browse = (next: BrowsedCard) => {
    setPending({ name: next.name, scryfallId: next.scryfallId });
    void (async () => {
      const fetched = await fetchScryfallDetail(next.scryfallId, next.name);
      const stillCurrent = pendingRef.current?.name === next.name
        && pendingRef.current?.scryfallId === next.scryfallId;
      if (!stillCurrent) {
        return;
      }
      // Seeding `detail` with the swap means the target-change refetch
      // runs in the background while the UI already has the data.
      setDetail(fetched);
      setBrowsed(next);
      setPending(null);
    })();
  };

  return {
    detail,
    detailLoading,
    browsed,
    pending,
    browse,
    back: () => setBrowsed(null),
  };
}
