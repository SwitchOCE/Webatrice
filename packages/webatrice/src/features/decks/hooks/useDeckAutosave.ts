import { useCallback, useEffect, useRef, useState } from 'react';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useReduxEffect } from '@app/hooks';

import { deleteCachedDeck, getCachedDeck, setCachedDeck } from '../deckEditorCache';
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
  /** Whether the deck has edits the server has not taken: one waiting on the debounce, or one
   *  whose save failed. Desktop's `isModified`. */
  isModified: boolean;
  /** Save now, resolving once the server answers: true when the deck is saved. */
  saveNow: () => Promise<boolean>;
  /** Drop the edits the server has not taken, as desktop's Discard does: nothing is sent, and
   *  reopening the deck downloads it again. */
  discardChanges: () => void;
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
  // A draft's first save while its deckUpload is in flight: its signature
  // and the deck name Servatrice files it under, which identifies the answer.
  const draftUploadRef = useRef<{ signature: string; name: string } | null>(null);
  // An edit came in while that upload was in flight; it is saved to the new
  // deck once its id arrives.
  const draftEditedRef = useRef(false);
  // The id the draft was stored under; later saves update that deck.
  const storedIdRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // `saveNow` callers waiting for the server to answer the saves in flight.
  const saveWaitersRef = useRef<((saved: boolean) => void)[]>([]);

  const answerWaiters = useCallback((saved: boolean) => {
    const waiters = saveWaitersRef.current;
    saveWaitersRef.current = [];
    waiters.forEach((resolve) => resolve(saved));
  }, []);

  const settle = useCallback((state: SaveState) => {
    settledStateRef.current = state;
    setSaveState(state);
  }, []);

  const persistNow = useCallback(() => {
    const current = readDeck();
    const targetId = deckId ?? storedIdRef.current;
    if (!current || (targetId == null && !draftRef.current)) {
      return;
    }
    const signature = deckSaveSignature(current);
    if (targetId == null) {
      const upload = draftUploadRef.current;
      if (upload != null) {
        draftEditedRef.current ||= signature !== upload.signature;
      } else if (signature !== savedSignatureRef.current) {
        // Servatrice files the deck under its name, or "Unnamed deck"
        // (serversocketinterface.cpp:997-1000).
        draftUploadRef.current = { signature, name: current.name || 'Unnamed deck' };
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
    webClient.request.session.deckUpdate(targetId, serializeDeckForSave(current), undefined, deckColorIdentity(current.cards));
  }, [deckId, webClient, readDeck]);

  useReduxEffect<{ deckId: number }>(
    ({ type, payload }) => {
      // An answer with nothing in flight belongs to an earlier mount.
      const targetId = deckId ?? storedIdRef.current;
      if (targetId == null || payload.deckId !== targetId || inFlightRef.current.length === 0) {
        return;
      }
      const signature = inFlightRef.current.shift()!;
      if (type === server.Types.DECK_UPDATE_FAILED) {
        settle('failed');
        answerWaiters(false);
        return;
      }
      savedSignatureRef.current = signature;
      // Keep the cached signature current so a remount after this save
      // sees the deck as clean and doesn't queue a spurious re-save.
      const cached = getCachedDeck(targetId);
      if (cached) {
        setCachedDeck(targetId, { ...cached, savedSignature: signature });
      }
      if (inFlightRef.current.length === 0) {
        settledStateRef.current = 'saved';
        // A newer edit still waiting for the debounce keeps the deck dirty.
        if (saveTimerRef.current == null) {
          setSaveState('saved');
        }
        answerWaiters(true);
      }
    },
    [server.Types.DECK_UPDATED, server.Types.DECK_UPDATE_FAILED],
    [deckId, answerWaiters],
  );

  // A draft's first save came back as a new stored deck: the root-level
  // upload filed under this deck's name. Edits made while it was in flight,
  // or still waiting on the debounce, are saved to the new deck now.
  useReduxEffect<{ path: string; treeItem: { id: number; name: string } }>(
    ({ payload }) => {
      const upload = draftUploadRef.current;
      if (upload == null || deckId != null || payload.path !== '' || payload.treeItem.name !== upload.name) {
        return;
      }
      draftUploadRef.current = null;
      storedIdRef.current = payload.treeItem.id;
      savedSignatureRef.current = upload.signature;
      const edited = draftEditedRef.current || saveTimerRef.current != null;
      draftEditedRef.current = false;
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (edited) {
        persistNow();
      } else {
        settle('saved');
        answerWaiters(true);
      }
      draftRef.current?.onStored(payload.treeItem.id, upload.signature);
    },
    server.Types.DECK_UPLOAD,
    [deckId, settle, persistNow, answerWaiters],
  );
  useReduxEffect<{ path: string }>(
    ({ payload }) => {
      if (draftUploadRef.current != null && payload.path === '') {
        draftUploadRef.current = null;
        // The in-flight edits are in the next attempt's deck.
        draftEditedRef.current = false;
        settle('failed');
        answerWaiters(false);
      }
    },
    server.Types.DECK_UPLOAD_FAILED,
    [settle, answerWaiters],
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

  const saveNow = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    persistNow();
    // Nothing went out and nothing is in flight: the server already holds this deck.
    if (inFlightRef.current.length === 0 && draftUploadRef.current == null) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      saveWaitersRef.current.push(resolve);
    });
  }, [persistNow]);

  const discardChanges = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // The cache mirrors unsaved edits; dropping the entry makes the next open download the deck.
    if (deckId != null) {
      deleteCachedDeck(deckId);
    }
    settle('idle');
  }, [deckId, settle]);

  const markSaved = useCallback((signature: string) => {
    savedSignatureRef.current = signature;
    settle('idle');
  }, [settle]);
  const resetSaved = useCallback(() => {
    savedSignatureRef.current = null;
    settle('idle');
  }, [settle]);
  const savedSignature = useCallback(() => savedSignatureRef.current, []);

  return {
    saveState,
    scheduleSave,
    flushSave,
    isModified: saveState === 'dirty' || saveState === 'failed',
    saveNow,
    discardChanges,
    markSaved,
    resetSaved,
    savedSignature,
  };
}
