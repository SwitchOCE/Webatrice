import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useStore } from 'react-redux';

import { useWebClient } from '@cockatrice/datatrice/react';
import type { RootState } from '@app/store';

import { createDeckSaveRegistry, type SaveState } from '../deckSaveRegistry';
import type { HydratedDeck } from '../types';

export const AUTOSAVE_DEBOUNCE_MS = 500;
export type { SaveState } from '../deckSaveRegistry';

export interface DeckAutosave {
  saveState: SaveState;
  /** Mark the deck dirty and (re)start the debounce. */
  scheduleSave: () => void;
  /** Save a pending change right now. Also runs on unmount. */
  flushSave: () => void;
  /** Record the signature as what the server holds. */
  markSaved: (signature: string) => void;
  /** Forget the saved signature: the next save uploads whatever the deck holds. */
  resetSaved: () => void;
  /** The last signature the server acknowledged, if any. */
  savedSignature: () => string | null;
}

/** Debounce belongs to the editor; request settlement belongs to its per-deck registry. */
export function useDeckAutosave(
  deckId: number | null,
  readDeck: () => HydratedDeck | null,
  initialSavedSignature: string | null,
): DeckAutosave {
  const webClient = useWebClient();
  const store = useStore<RootState>();
  const registry = useMemo(() => createDeckSaveRegistry(store, webClient), [store, webClient]);
  const getSnapshot = useCallback(() => registry.getSnapshot(deckId), [registry, deckId]);
  const { saveState } = useSyncExternalStore(registry.subscribe, getSnapshot);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    registry.connect();
    if (deckId != null) {
      registry.initialize(deckId, initialSavedSignature);
    }
  }, [registry, deckId, initialSavedSignature]);

  const persistNow = useCallback(() => {
    const current = readDeck();
    if (current && deckId != null) {
      registry.save(deckId, current);
    }
  }, [registry, deckId, readDeck]);

  const scheduleSave = useCallback(() => {
    if (deckId == null) {
      return;
    }
    registry.markDirty(deckId);
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persistNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [registry, deckId, persistNow]);

  // On an identity change this cleanup runs while readDeck still reads the
  // previous deck, before the editor installs the next deck's snapshot.
  const flushSave = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      persistNow();
    }
  }, [persistNow]);
  useEffect(() => flushSave, [flushSave]);
  useEffect(() => () => registry.dispose(), [registry]);

  const markSaved = useCallback((signature: string) => {
    if (deckId != null) {
      registry.markSaved(deckId, signature);
    }
  }, [registry, deckId]);
  const resetSaved = useCallback(() => {
    if (deckId != null) {
      registry.markSaved(deckId, null);
    }
  }, [registry, deckId]);
  const savedSignature = useCallback(() => registry.getSnapshot(deckId).savedSignature, [registry, deckId]);

  return { saveState, scheduleSave, flushSave, markSaved, resetSaved, savedSignature };
}
