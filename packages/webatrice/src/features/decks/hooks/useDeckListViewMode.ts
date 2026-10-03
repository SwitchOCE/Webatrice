import { useEffect, useState } from 'react';

/**
 * MyDecks row layout: `card` is the tall row with commander art bleeding
 * in from the right; `compact` is a one-line row with a thumbnail, better
 * for skimming a long list.
 */
export type DeckListViewMode = 'card' | 'compact';

export const VIEW_MODE_STORAGE_KEY = 'decks:viewMode';

/** The stored view mode; `card` when missing, invalid or storage is unavailable. */
export function readStoredViewMode(): DeckListViewMode {
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (raw === 'compact' || raw === 'card') {
      return raw;
    }
  } catch {
    // Storage disabled — fall through.
  }
  return 'card';
}

/** The MyDecks view mode, remembered in localStorage per browser. */
export function useDeckListViewMode(): [DeckListViewMode, (mode: DeckListViewMode) => void] {
  const [viewMode, setViewMode] = useState<DeckListViewMode>(readStoredViewMode);
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Storage disabled (private mode, quota, …) — the choice still
      // holds for this session.
    }
  }, [viewMode]);
  return [viewMode, setViewMode];
}
