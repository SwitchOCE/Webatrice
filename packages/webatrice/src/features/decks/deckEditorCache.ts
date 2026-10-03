import type { HydratedDeck } from './types';

/**
 * Session cache of hydrated decks by deck id. Survives unmounts so
 * switching tabs (MyDecks ↔ an open deck) doesn't re-download and
 * re-hydrate every time — otherwise every tab return flashes "Loading…"
 * while the `.cod` round-trips to Servatrice and hydration's Dexie /
 * Scryfall lookups run again.
 *
 * Entries mirror the in-editor deck (including unsaved edits) plus the
 * last-known-saved XML, so the autosave dirty check keeps working after a
 * remount. Dropped by MyDecks' Refresh (`clearDeckEditorCache`), by a
 * delete (`deleteCachedDeck`), and on an identity change via the shell
 * lifecycle.
 */
export interface CachedDeck {
  deck: HydratedDeck;
  savedXml: string;
}

const deckCache: Map<number, CachedDeck> = new Map();

export function getCachedDeck(deckId: number): CachedDeck | undefined {
  return deckCache.get(deckId);
}

export function setCachedDeck(deckId: number, entry: CachedDeck): void {
  deckCache.set(deckId, entry);
}

export function clearDeckEditorCache(): void {
  deckCache.clear();
}

export function deleteCachedDeck(deckId: number): void {
  deckCache.delete(deckId);
}
