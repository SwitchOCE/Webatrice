import { ScryfallImageSize } from '@cockatrice/datatrice';
import { useMemo, useState } from 'react';

import {
  DEFAULT_PICTURE_URL_TEMPLATES,
  loadCardDataPreferences,
  resolveCardImageUrls,
  type CardDataPreferences,
  type CardImageSubject,
} from '@app/services';

import { createSharedStore, LoadingState, useSharedStore, type Loadable } from './useSharedStore';

/**
 * Process-wide snapshot of the user's set priority and picture URL templates.
 * The card-database dialogs call `refreshCardDataPreferences` after a save so
 * every image and lookup re-resolves against the new choices.
 */
// Arrow keeps the services binding lazy, so specs that mock `@app/services` can still import `@app/hooks`.
export const cardDataPreferencesStore = createSharedStore<CardDataPreferences>(() => loadCardDataPreferences());

export async function refreshCardDataPreferences(): Promise<CardDataPreferences> {
  const next = await loadCardDataPreferences();
  cardDataPreferencesStore.setValue(next);
  return next;
}

/**
 * The current preferences for one-off async readers. Not `whenReady()` alone:
 * that resolves once and would keep returning the pre-save snapshot.
 */
export async function currentCardDataPreferences(): Promise<CardDataPreferences> {
  return cardDataPreferencesStore.peek() ?? cardDataPreferencesStore.whenReady();
}

export function useCardDataPreferences(): Loadable<CardDataPreferences> {
  return useSharedStore(cardDataPreferencesStore);
}

/**
 * Walk an ordered candidate list the way desktop's picture loader walks its
 * URLs: show the first, advance on each load error, give up (null) at the end.
 */
export function useImageCandidates(urls: readonly string[]): { src: string | null; onError: () => void } {
  // Keyed on the list contents so a new card starts again from its first URL.
  const key = urls.join('\n');
  const [failed, setFailed] = useState({ key, count: 0 });
  const index = failed.key === key ? failed.count : 0;
  return {
    src: urls[index] ?? null,
    onError: () => setFailed({ key, count: index + 1 }),
  };
}

/**
 * Ordered image candidates for a cards.xml / tokens.xml record, honouring the
 * user's set priority and picture URL templates. Empty while preferences load
 * so the first request already goes to the right source.
 */
export function useCardImageUrls(
  card: CardImageSubject | null | undefined, preferredSet?: string, fallbackSize = ScryfallImageSize.Normal,
): string[] {
  const preferences = useCardDataPreferences();
  return useMemo(() => {
    if (!card || preferences.status === LoadingState.LOADING) {
      return [];
    }
    const value = preferences.value;
    return resolveCardImageUrls(card, {
      templates: value?.pictureUrlTemplates ?? DEFAULT_PICTURE_URL_TEMPLATES,
      setPreferences: value?.setPreferences ?? new Map(),
      setLongNames: value?.setLongNames,
      preferredSet,
      fallbackSize,
    });
  }, [card, preferences, preferredSet, fallbackSize]);
}
