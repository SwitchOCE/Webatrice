import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from 'react-redux';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useReduxEffect } from '@app/hooks';
import type { RootState } from '@app/store';

import { deleteCachedDraft } from '../deckEditorCache';
import { deckColorIdentity, deckSaveSignature, serializeDeckForSave } from '../deckPersistence';
import { getDeckSaveRegistry, type SaveState } from '../deckSaveRegistry';
import type { HydratedDeck } from '../types';

export const AUTOSAVE_DEBOUNCE_MS = 500;
export type { SaveState } from '../deckSaveRegistry';

export interface DeckAutosave {
  saveState: SaveState;
  /** Mark the deck dirty and (re)start the debounce. */
  scheduleSave: () => void;
  /** Save a pending change right now. Also runs on unmount. */
  flushSave: () => void;
  /** Edits waiting on the debounce, or a failed save. */
  isModified: boolean;
  /** Save now and wait until this deck's saves settle. */
  saveNow: () => Promise<boolean>;
  /** Cancel unsent edits and forget their cached contents. */
  discardChanges: () => void;
  /** Hold autosave until the open-deck choice is resolved. */
  pauseAutosave: () => void;
  /** Schedule held edits once, unless explicitly saved or discarded. */
  resumeAutosave: () => void;
  /** Record the signature as what the server holds. */
  markSaved: (signature: string) => void;
  /** Forget the saved signature: the next save uploads whatever the deck holds. */
  resetSaved: () => void;
  /** The last signature the server acknowledged, if any. */
  savedSignature: () => string | null;
}

/** An unsaved draft's autosave (`deckId` null): its first save stores it. */
export interface DraftAutosave {
  /** Handoff token: changing route tokens need not remount the editor. */
  key: string;
  /** The draft's first save was stored as deck `deckId`, holding `signature`. */
  onStored: (deckId: number, signature: string) => void;
}

/**
 * Debounce belongs to the editor; stored saves settle in the per-deck registry.
 * A draft keeps its first upload local until the server assigns it a deck id.
 */
export function useDeckAutosave(
  deckId: number | null,
  readDeck: () => HydratedDeck | null,
  initialSavedSignature: string | null,
  draft?: DraftAutosave,
): DeckAutosave {
  const webClient = useWebClient();
  const store = useStore<RootState>();
  const registry = useMemo(() => getDeckSaveRegistry(store, webClient), [store, webClient]);
  // The upload can finish before navigation supplies the stored deck id.
  // Read this ref in callbacks too, so a pending cleanup cannot upload again.
  const storedIdRef = useRef<number | null>(null);
  const getSnapshot = useCallback(() => registry.getSnapshot(deckId ?? storedIdRef.current), [registry, deckId]);
  const { saveState: storedSaveState, isModified: storedIsModified } = useSyncExternalStore(registry.subscribe, getSnapshot);
  const saveTimerRef = useRef<number | null>(null);
  const savePendingRef = useRef(false);
  const autosavePausedRef = useRef(false);
  const [draftSaveState, setDraftSaveState] = useState<SaveState>('idle');
  const draftSavedSignatureRef = useRef<string | null>(deckId == null ? initialSavedSignature : null);
  // Only the matching DECK_UPLOAD / DECK_UPLOAD_FAILED may settle this save.
  const draftUploadRef = useRef<{ signature: string; requestId: string } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const draftKey = draft?.key ?? null;
  const previousDraftKeyRef = useRef(draftKey);
  const previousIdentityRef = useRef({ deckId, draftKey });
  // Stored-deck waiters live in the registry; only the first upload waits here.
  const draftWaitersRef = useRef<((saved: boolean) => void)[]>([]);
  const answerDraftWaiters = useCallback((saved: boolean) => {
    const waiters = draftWaitersRef.current;
    draftWaitersRef.current = [];
    waiters.forEach((resolve) => resolve(saved));
  }, []);
  // Cancelling a timer does not discard edits or change request settlement.
  const cancelScheduledSave = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const previous = previousIdentityRef.current;
    if (previous.deckId === deckId && previous.draftKey === draftKey) {
      return;
    }
    // Keep a hold across this draft's handoff, but never carry it to another deck.
    const handoff = previous.deckId == null && deckId != null && storedIdRef.current === deckId;
    if (!handoff) {
      autosavePausedRef.current = false;
      savePendingRef.current = false;
    }
    previousIdentityRef.current = { deckId, draftKey };
  }, [deckId, draftKey]);

  useEffect(() => {
    if (previousDraftKeyRef.current === draftKey) {
      return;
    }
    // The previous identity's cleanup flushes before this reset, while
    // readDeck still holds its contents. B must never inherit A's stored id.
    previousDraftKeyRef.current = draftKey;
    storedIdRef.current = null;
    draftUploadRef.current = null;
    draftSavedSignatureRef.current = null;
    answerDraftWaiters(false);
    setDraftSaveState('idle');
  }, [draftKey, answerDraftWaiters]);

  useEffect(() => {
    registry.connect();
    if (deckId != null) {
      registry.initialize(deckId, initialSavedSignature);
      storedIdRef.current = null;
    }
  }, [registry, deckId, initialSavedSignature]);

  const persistNow = useCallback(() => {
    if (autosavePausedRef.current) {
      return;
    }
    savePendingRef.current = false;
    const current = readDeck();
    const targetId = deckId ?? storedIdRef.current;
    if (!current) {
      return;
    }
    if (targetId != null) {
      registry.save(targetId, current);
      return;
    }
    if (!draftRef.current) {
      return;
    }
    const signature = deckSaveSignature(current);
    if (draftUploadRef.current == null && signature !== draftSavedSignatureRef.current) {
      const requestId = crypto.randomUUID();
      draftUploadRef.current = { signature, requestId };
      setDraftSaveState('saving');
      webClient.request.session.deckUpload('', 0, serializeDeckForSave(current), undefined, deckColorIdentity(current.cards), requestId);
    }
  }, [registry, deckId, webClient, readDeck]);

  // A draft's first save came back as a new stored deck.
  useReduxEffect<{ path: string; treeItem: { id: number }; requestId?: string }>(
    ({ payload }) => {
      const upload = draftUploadRef.current;
      if (upload == null || deckId != null || payload.requestId !== upload.requestId) {
        return;
      }
      const { signature } = upload;
      draftUploadRef.current = null;
      storedIdRef.current = payload.treeItem.id;
      draftSavedSignatureRef.current = signature;
      setDraftSaveState('saved');
      cancelScheduledSave();
      registry.initialize(payload.treeItem.id, signature);
      const current = readDeck();
      const paused = autosavePausedRef.current;
      savePendingRef.current = paused && current != null && deckSaveSignature(current) !== signature;
      if (savePendingRef.current) {
        registry.markDirty(payload.treeItem.id);
      }
      // Detach before onStored navigates: reset/unmount must not fail waiters
      // whose remaining work now belongs to the stored deck's registry entry.
      const waiters = draftWaitersRef.current;
      draftWaitersRef.current = [];
      draftRef.current?.onStored(payload.treeItem.id, signature);
      // Include edits whose debounce already fired as well as ones still
      // waiting on it. The registry skips unchanged contents and owns replies.
      if (current) {
        if (waiters.length) {
          const completion = paused ? registry.waitForSave(payload.treeItem.id) : registry.saveNow(payload.treeItem.id, current);
          void completion.then((saved) => {
            waiters.forEach((resolve) => resolve(saved));
          });
        } else if (!paused) {
          registry.save(payload.treeItem.id, current);
        }
      } else {
        waiters.forEach((resolve) => resolve(false));
      }
    },
    server.Types.DECK_UPLOAD,
    [deckId, registry, readDeck, cancelScheduledSave],
  );
  useReduxEffect<{ requestId?: string }>(
    ({ payload }) => {
      const upload = draftUploadRef.current;
      if (deckId == null && upload != null && payload.requestId === upload.requestId) {
        draftUploadRef.current = null;
        setDraftSaveState('failed');
        answerDraftWaiters(false);
      }
    },
    server.Types.DECK_UPLOAD_FAILED,
    [deckId, answerDraftWaiters],
  );

  const scheduleSave = useCallback(() => {
    const targetId = deckId ?? storedIdRef.current;
    if (targetId != null) {
      registry.markDirty(targetId);
    } else if (draftRef.current) {
      setDraftSaveState('dirty');
    } else {
      return;
    }
    savePendingRef.current = true;
    cancelScheduledSave();
    if (autosavePausedRef.current) {
      return;
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persistNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [registry, deckId, persistNow, cancelScheduledSave]);

  // On an identity change this cleanup runs while readDeck still reads the
  // previous deck, before the editor installs the next deck's snapshot.
  const flushSave = useCallback(() => {
    if (savePendingRef.current && !autosavePausedRef.current) {
      cancelScheduledSave();
      persistNow();
    }
  }, [persistNow, cancelScheduledSave]);
  useEffect(() => flushSave, [flushSave, draftKey]);
  useEffect(() => () => answerDraftWaiters(false), [answerDraftWaiters, draftKey]);

  const pauseAutosave = useCallback(() => {
    autosavePausedRef.current = true;
    cancelScheduledSave();
  }, [cancelScheduledSave]);

  const resumeAutosave = useCallback(() => {
    if (!autosavePausedRef.current) {
      return;
    }
    autosavePausedRef.current = false;
    if (savePendingRef.current) {
      scheduleSave();
    }
  }, [scheduleSave]);

  const saveNow = useCallback((): Promise<boolean> => {
    // Choosing Save ends the hold. Later edits can also settle its registry waiter.
    autosavePausedRef.current = false;
    savePendingRef.current = false;
    cancelScheduledSave();
    const targetId = deckId ?? storedIdRef.current;
    const current = readDeck();
    if (!current) {
      return Promise.resolve(false);
    }
    if (targetId != null) {
      return registry.saveNow(targetId, current);
    }
    if (!draftRef.current) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      draftWaitersRef.current.push(resolve);
      persistNow();
      if (draftUploadRef.current == null && storedIdRef.current == null) {
        answerDraftWaiters(draftSavedSignatureRef.current === deckSaveSignature(current));
      }
    });
  }, [registry, deckId, readDeck, persistNow, cancelScheduledSave, answerDraftWaiters]);

  const discardChanges = useCallback(() => {
    savePendingRef.current = false;
    cancelScheduledSave();
    const targetId = deckId ?? storedIdRef.current;
    if (targetId != null) {
      registry.discardChanges(targetId);
    } else {
      if (draftKey != null) {
        deleteCachedDraft(draftKey);
      }
      draftUploadRef.current = null;
      draftSavedSignatureRef.current = null;
      answerDraftWaiters(false);
      setDraftSaveState('idle');
    }
  }, [registry, deckId, draftKey, cancelScheduledSave, answerDraftWaiters]);

  const markSaved = useCallback((signature: string) => {
    const targetId = deckId ?? storedIdRef.current;
    if (targetId != null) {
      registry.markSaved(targetId, signature);
    } else {
      draftSavedSignatureRef.current = signature;
      setDraftSaveState('idle');
    }
  }, [registry, deckId]);
  const resetSaved = useCallback(() => {
    const targetId = deckId ?? storedIdRef.current;
    if (targetId != null) {
      registry.markSaved(targetId, null);
    } else {
      draftSavedSignatureRef.current = null;
      setDraftSaveState('idle');
    }
  }, [registry, deckId]);
  const savedSignature = useCallback(() => {
    const targetId = deckId ?? storedIdRef.current;
    return targetId == null ? draftSavedSignatureRef.current : registry.getSnapshot(targetId).savedSignature;
  }, [registry, deckId]);
  // A newly initialized entry is idle. Until navigation, retain the upload's
  // saved indicator unless the registry has an update to report.
  const saveState = deckId == null && (storedIdRef.current == null || storedSaveState === 'idle')
    ? draftSaveState : storedSaveState;
  const isModified = (deckId ?? storedIdRef.current) != null
    ? storedIsModified : draftSaveState === 'dirty' || draftSaveState === 'failed';

  return {
    saveState, isModified, saveNow, discardChanges, pauseAutosave, resumeAutosave,
    scheduleSave, flushSave, markSaved, resetSaved, savedSignature,
  };
}
