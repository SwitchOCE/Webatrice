import { useCallback, useEffect, useRef, useState } from 'react';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useReduxEffect } from '@app/hooks';

import { getCachedDeck, setCachedDeck } from '../deckEditorCache';
import { deckColorIdentity, deckSaveSignature, serializeDeckForSave } from '../deckPersistence';
import type { HydratedDeck } from '../types';

export const AUTOSAVE_DEBOUNCE_MS = 500;

/** `failed` mirrors desktop's "The deck could not be saved." */
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';

export interface DeckAutosave {
  saveState: SaveState;
  /** Mark the deck dirty and (re)start the debounce. */
  scheduleSave: () => void;
  /** Save a pending change right now. Also runs on unmount. */
  flushSave: () => void;
  /** Record `signature` (see `deckSaveSignature`) as what the server holds. */
  markSaved: (signature: string) => void;
  /** Forget the saved signature and show the deck as clean: the next save uploads whatever the deck holds. */
  resetSaved: () => void;
  /** The last signature the server acknowledged, if any. */
  savedSignature: () => string | null;
}

/** An unsaved draft's autosave (`deckId` null): its first save stores it. */
export interface DraftAutosave {
  /** The draft's first save was stored as deck `deckId`, holding `signature`. */
  onStored: (deckId: number, signature: string) => void;
}

/**
 * Debounced autosave for the open deck, sent as Sockatrice `deckUpdate`
 * (desktop `actSaveDeck` for a remote deck). An unsaved draft (`deckId`
 * null, `draft` given) is stored by its first save instead, as a new deck
 * at the root (`deckUpload` with id 0, like My Decks' "New deck").
 *
 * Each save reads the latest deck through `readDeck` (so the timer never sees
 * a stale snapshot) and uploads only when its signature differs from the last
 * one the server acknowledged — undoing back to the saved state, or a burst of
 * edits that cancel out, sends nothing. "Saved" and "failed" come from the
 * server's answer (`DECK_UPDATED` / `DECK_UPDATE_FAILED`); answers arrive in
 * send order, so a FIFO of in-flight signatures pairs each answer with its save.
 */
export function useDeckAutosave(
  deckId: number | null,
  readDeck: () => HydratedDeck | null,
  initialSavedSignature: string | null,
  draft?: DraftAutosave,
): DeckAutosave {
  const webClient = useWebClient();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimerRef = useRef<number | null>(null);
  const savedSignatureRef = useRef<string | null>(initialSavedSignature);
  const inFlightRef = useRef<string[]>([]);
  // What the indicator falls back to when a dirty deck turns out unchanged.
  const settledStateRef = useRef<SaveState>('idle');
  // A draft's first save while its deckUpload is in flight: its signature.
  const draftUploadRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const settle = useCallback((state: SaveState) => {
    settledStateRef.current = state;
    setSaveState(state);
  }, []);

  const persistNow = useCallback(() => {
    const current = readDeck();
    if (!current || (deckId == null && !draftRef.current)) {
      return;
    }
    const signature = deckSaveSignature(current);
    if (deckId == null) {
      if (draftUploadRef.current == null && signature !== savedSignatureRef.current) {
        draftUploadRef.current = signature;
        setSaveState('saving');
        webClient.request.session.deckUpload('', 0, serializeDeckForSave(current), undefined, deckColorIdentity(current.cards));
      }
      return;
    }
    const inFlight = inFlightRef.current;
    const latestKnown = inFlight.length > 0 ? inFlight[inFlight.length - 1] : savedSignatureRef.current;
    if (signature === latestKnown) {
      setSaveState(inFlight.length > 0 ? 'saving' : settledStateRef.current);
      return;
    }
    inFlight.push(signature);
    setSaveState('saving');
    // Visibility is left as is; the color identity is sent every time,
    // since the server overwrites it on each update.
    webClient.request.session.deckUpdate(deckId, serializeDeckForSave(current), undefined, deckColorIdentity(current.cards));
  }, [deckId, webClient, readDeck]);

  useReduxEffect<{ deckId: number }>(
    ({ type, payload }) => {
      // An answer with nothing in flight belongs to an earlier mount.
      if (deckId == null || payload.deckId !== deckId || inFlightRef.current.length === 0) {
        return;
      }
      const signature = inFlightRef.current.shift()!;
      if (type === server.Types.DECK_UPDATE_FAILED) {
        settle('failed');
        return;
      }
      savedSignatureRef.current = signature;
      // Keep the cached signature current so a remount after this save
      // sees the deck as clean and doesn't queue a spurious re-save.
      const cached = getCachedDeck(deckId);
      if (cached) {
        setCachedDeck(deckId, { ...cached, savedSignature: signature });
      }
      if (inFlightRef.current.length === 0) {
        settledStateRef.current = 'saved';
        // A newer edit still waiting for the debounce keeps the deck dirty.
        if (saveTimerRef.current == null) {
          setSaveState('saved');
        }
      }
    },
    [server.Types.DECK_UPDATED, server.Types.DECK_UPDATE_FAILED],
    [deckId],
  );

  // A draft's first save came back as a new stored deck.
  useReduxEffect<{ path: string; treeItem: { id: number } }>(
    ({ payload }) => {
      const signature = draftUploadRef.current;
      if (signature == null || deckId != null) {
        return;
      }
      draftUploadRef.current = null;
      savedSignatureRef.current = signature;
      settle('saved');
      draftRef.current?.onStored(payload.treeItem.id, signature);
    },
    server.Types.DECK_UPLOAD,
    [deckId, settle],
  );
  useReduxEffect(
    () => {
      if (draftUploadRef.current != null) {
        draftUploadRef.current = null;
        settle('failed');
      }
    },
    server.Types.DECK_UPLOAD_FAILED,
    [settle],
  );

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

  const markSaved = useCallback((signature: string) => {
    savedSignatureRef.current = signature;
    settle('idle');
  }, [settle]);
  const resetSaved = useCallback(() => {
    savedSignatureRef.current = null;
    settle('idle');
  }, [settle]);
  const savedSignature = useCallback(() => savedSignatureRef.current, []);

  return { saveState, scheduleSave, flushSave, markSaved, resetSaved, savedSignature };
}
