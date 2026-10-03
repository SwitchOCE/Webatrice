import { useCallback, useEffect, useRef, useState } from 'react';

import { useWebClient } from '@cockatrice/datatrice/react';

import { getCachedDeck, setCachedDeck } from '../deckEditorCache';
import { serializeDeckForSave, uploadDeckUpdate } from '../deckPersistence';
import type { HydratedDeck } from '../types';

export const AUTOSAVE_DEBOUNCE_MS = 500;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';

export interface DeckAutosave {
  saveState: SaveState;
  /** Mark the deck dirty and (re)start the debounce. */
  scheduleSave: () => void;
  /** Save a pending change right now. Also runs on unmount. */
  flushSave: () => void;
  /** Record `xml` as what the server holds and show the deck as clean. */
  markSaved: (xml: string) => void;
  /** Forget the saved signature and show the deck as clean (a fresh download is on its way). */
  resetSaved: () => void;
  /** The last XML known to be on the server, if any. */
  savedXml: () => string | null;
}

/**
 * Debounced autosave for the open deck. Each save serializes the latest
 * deck (read through `readDeck`, so the timer never sees a stale
 * snapshot), skips the upload when the XML matches the last save, and
 * reports "Saving…" → "Saved" from the server's ack (or "failed"
 * when the server rejects it or never answers).
 */
export function useDeckAutosave(
  deckId: number | null,
  readDeck: () => HydratedDeck | null,
  initialSavedXml: string | null,
): DeckAutosave {
  const webClient = useWebClient();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimerRef = useRef<number | null>(null);
  const savedXmlRef = useRef<string | null>(initialSavedXml);

  const persistNow = useCallback(() => {
    const current = readDeck();
    if (!current || deckId == null) {
      return;
    }
    const xml = serializeDeckForSave(current);
    if (xml === savedXmlRef.current) {
      return;
    }
    const previousXml = savedXmlRef.current;
    savedXmlRef.current = xml;
    // Keep the cached signature current so a remount after this save
    // sees the deck as clean and doesn't queue a spurious re-save.
    const cached = getCachedDeck(deckId);
    if (cached) {
      setCachedDeck(deckId, { deck: cached.deck, savedXml: xml });
    }
    setSaveState('saving');
    uploadDeckUpdate(webClient, deckId, xml, () => setSaveState('saved'), () => {
      // Not saved: forget the optimistic signature (here and in the cache) so
      // the next edit or unmount flush sends this content again.
      if (savedXmlRef.current === xml) {
        savedXmlRef.current = previousXml;
      }
      const entry = getCachedDeck(deckId);
      if (entry?.savedXml === xml) {
        setCachedDeck(deckId, { deck: entry.deck, savedXml: previousXml ?? '' });
      }
      setSaveState('failed');
    });
  }, [deckId, webClient, readDeck]);

  const scheduleSave = useCallback(() => {
    setSaveState('dirty');
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persistNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [persistNow]);

  // Flushed on unmount too, so closing the tab or navigating away
  // doesn't drop the last edit.
  const flushSave = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      persistNow();
    }
  }, [persistNow]);
  useEffect(() => flushSave, [flushSave]);

  const markSaved = useCallback((xml: string) => {
    savedXmlRef.current = xml;
    setSaveState('idle');
  }, []);
  const resetSaved = useCallback(() => {
    savedXmlRef.current = null;
    setSaveState('idle');
  }, []);
  const savedXml = useCallback(() => savedXmlRef.current, []);

  return { saveState, scheduleSave, flushSave, markSaved, resetSaved, savedXml };
}
