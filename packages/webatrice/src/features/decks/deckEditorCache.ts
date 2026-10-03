import type { HydratedDeck } from './types';

/**
 * Session cache of hydrated decks by deck id. Survives unmounts so
 * switching tabs (MyDecks ↔ an open deck) doesn't re-download and
 * re-hydrate every time — otherwise every tab return flashes "Loading…"
 * while the `.cod` round-trips to Servatrice and hydration's Dexie /
 * Scryfall lookups run again.
 *
 * Entries mirror the in-editor deck (including unsaved edits) plus the
 * signature of the last save the server acknowledged (`deckSaveSignature`),
 * so the autosave dirty check keeps working after a remount. Dropped by MyDecks' Refresh (`clearDeckEditorCache`), by a
 * delete (`deleteCachedDeck`), and on an identity change via the shell
 * lifecycle.
 */
export interface CachedDeck {
  deck: HydratedDeck;
  /** `null` when the stored file still needs rewriting (format/zone migration). */
  savedSignature: string | null;
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

/**
 * Unsaved drafts by handoff token (services/decks deckHandoff): the staged
 * deck document, kept once taken so a remount (a tab switch, StrictMode)
 * hydrates it again, and the draft's latest in-editor state.
 */
const draftDocuments: Map<string, string> = new Map();
const draftCache: Map<string, HydratedDeck> = new Map();

export function getDraftDocument(token: string): string | undefined {
  return draftDocuments.get(token);
}

export function setDraftDocument(token: string, cod: string): void {
  draftDocuments.set(token, cod);
}

export function getCachedDraft(token: string): HydratedDeck | undefined {
  return draftCache.get(token);
}

export function setCachedDraft(token: string, deck: HydratedDeck): void {
  draftCache.set(token, deck);
}

/** Forget a draft once it is stored as a deck. */
export function deleteDraft(token: string): void {
  draftDocuments.delete(token);
  draftCache.delete(token);
}
