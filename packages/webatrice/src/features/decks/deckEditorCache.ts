import { onSessionEnd } from '@app/services/session';

import type { HydratedDeck } from './types';

export interface CachedDeck {
  deck: HydratedDeck;
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
onSessionEnd(clearDeckEditorCache);

export function deleteCachedDeck(deckId: number): void {
  deckCache.delete(deckId);
}

const draftDocuments: Map<string, string> = new Map();
const draftCache: Map<string, HydratedDeck> = new Map();
onSessionEnd(() => {
  draftDocuments.clear();
  draftCache.clear();
});

export function getDraftDocument(token: string): string | undefined {
  return draftDocuments.get(token);
}

const MAX_DRAFTS = 4;

export function setDraftDocument(token: string, cod: string): void {
  draftDocuments.set(token, cod);
  for (const oldest of draftDocuments.keys()) {
    if (draftDocuments.size <= MAX_DRAFTS) {
      break;
    }
    draftDocuments.delete(oldest);
    draftCache.delete(oldest);
  }
}

export function getCachedDraft(token: string): HydratedDeck | undefined {
  return draftCache.get(token);
}

export function setCachedDraft(token: string, deck: HydratedDeck): void {
  draftCache.set(token, deck);
}

export function deleteCachedDraft(token: string): void {
  draftCache.delete(token);
}

export function deleteDraft(token: string): void {
  draftDocuments.delete(token);
  draftCache.delete(token);
}
