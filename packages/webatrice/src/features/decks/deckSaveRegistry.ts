import { server, type CommandFailedPayload } from '@cockatrice/datatrice';
import type { WebClient } from '@cockatrice/sockatrice';
import type { RootState } from '@app/store';

import { clearDeckEditorCache, deleteCachedDeck, getCachedDeck, setCachedDeck } from './deckEditorCache';
import { deckColorIdentity, deckSaveSignature, serializeDeckForSave } from './deckPersistence';
import type { HydratedDeck } from './types';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';

export interface DeckSaveSnapshot {
  savedSignature: string | null;
  lastFailure: CommandFailedPayload | null;
  pending: ReadonlyMap<number, string>;
  saveState: SaveState;
  isModified: boolean;
}

interface Entry {
  snapshot: DeckSaveSnapshot;
  dirty: boolean;
  lastSavedRequest: number;
  lastSettledRequest: number;
  waiters: Set<(saved: boolean) => void>;
}

type SessionStore = { getState: () => RootState; subscribe: (listener: () => void) => () => void };
const EMPTY: DeckSaveSnapshot = { savedSignature: null, lastFailure: null, pending: new Map(), saveState: 'idle', isModified: false };

export function createDeckSaveRegistry(store: SessionStore, client: WebClient) {
  const identity = () => {
    const state = store.getState();
    const serverName = server.Selectors.getName(state);
    const userName = server.Selectors.getUser(state)?.name;
    return server.Selectors.getIsConnected(state) && serverName && userName
      ? JSON.stringify([serverName, userName])
      : null;
  };
  let session = identity();
  const entries = new Map<number, Entry>();
  const listeners = new Set<() => void>();
  let nextRequest = 0;
  let unsubscribe: (() => void) | undefined;

  const emit = () => listeners.forEach((listener) => listener());
  const answerWaiters = (entry: Entry, saved: boolean) => {
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    waiters.forEach((resolve) => resolve(saved));
  };
  const syncSession = () => {
    const next = identity();
    if (session !== next) {
      session = next;
      entries.forEach((entry) => answerWaiters(entry, false));
      entries.clear();
      clearDeckEditorCache();
      emit();
    }
  };
  const initialize = (deckId: number, savedSignature: string | null) => {
    if (session == null || entries.has(deckId)) {
      return;
    }
    entries.set(deckId, {
      snapshot: { ...EMPTY, savedSignature }, dirty: false, lastSavedRequest: 0, lastSettledRequest: 0, waiters: new Set(),
    });
    emit();
  };
  const publish = (entry: Entry, patch: Partial<DeckSaveSnapshot> = {}) => {
    const snapshot = { ...entry.snapshot, ...patch };
    snapshot.saveState = entry.dirty ? 'dirty'
      : snapshot.pending.size ? 'saving'
        : snapshot.lastFailure ? 'failed'
          : entry.lastSavedRequest ? 'saved' : 'idle';
    snapshot.isModified = snapshot.saveState === 'dirty' || snapshot.saveState === 'failed';
    entry.snapshot = snapshot;
    if (snapshot.pending.size === 0 && (!entry.dirty || snapshot.lastFailure)) {
      answerWaiters(entry, !entry.dirty && !snapshot.lastFailure);
    }
    emit();
  };

  const registry = {
    connect() {
      syncSession();
      unsubscribe ??= store.subscribe(syncSession);
    },
    dispose() {
      unsubscribe?.();
      unsubscribe = undefined;
      entries.forEach((entry) => answerWaiters(entry, false));
      entries.clear();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(deckId: number | null): DeckSaveSnapshot {
      return deckId == null ? EMPTY : entries.get(deckId)?.snapshot ?? EMPTY;
    },
    initialize,
    markSaved(deckId: number, savedSignature: string | null) {
      initialize(deckId, savedSignature);
      const entry = entries.get(deckId);
      if (!entry) {
        return;
      }
      answerWaiters(entry, false);
      entry.dirty = false;
      entry.lastSavedRequest = 0;
      entry.lastSettledRequest = nextRequest;
      publish(entry, { savedSignature, lastFailure: null, pending: new Map() });
    },
    markDirty(deckId: number) {
      const entry = entries.get(deckId);
      if (!entry) {
        return;
      }
      entry.dirty = true;
      publish(entry);
    },
    discardChanges(deckId: number) {
      deleteCachedDeck(deckId);
      const entry = entries.get(deckId);
      if (entry) {
        answerWaiters(entry, false);
        entry.dirty = false;
        publish(entry, { lastFailure: null });
      }
    },
    saveNow(deckId: number, deck: HydratedDeck, document?: { xml: string; colorIdentity?: string }): Promise<boolean> {
      registry.save(deckId, deck, document);
      return registry.waitForSave(deckId);
    },
    waitForSave(deckId: number): Promise<boolean> {
      const entry = entries.get(deckId);
      if (!entry) {
        return Promise.resolve(false);
      }
      if (entry.snapshot.pending.size === 0 && (!entry.dirty || entry.snapshot.lastFailure)) {
        return Promise.resolve(!entry.dirty && !entry.snapshot.lastFailure);
      }
      return new Promise((resolve) => entry.waiters.add(resolve));
    },
    save(deckId: number, deck: HydratedDeck, document?: { xml: string; colorIdentity?: string }) {
      syncSession();
      const entry = entries.get(deckId);
      if (!entry) {
        return;
      }
      const signature = deckSaveSignature(deck);
      const { pending, savedSignature, lastFailure } = entry.snapshot;
      const latestPending = [...pending.entries()].at(-1);
      const latestKnown = latestPending && latestPending[0] > entry.lastSavedRequest ? latestPending[1] : savedSignature;
      entry.dirty = false;
      if (signature === latestKnown && (pending.size > 0 || !lastFailure)) {
        publish(entry);
        return;
      }
      const requestId = ++nextRequest;
      publish(entry, { pending: new Map(pending).set(requestId, signature) });
      client.request.session.deckUpdate(
        deckId, document?.xml ?? serializeDeckForSave(deck), undefined, document?.colorIdentity ?? deckColorIdentity(deck.cards),
        (error) => {
          if (entries.get(deckId) !== entry || !entry.snapshot.pending.has(requestId)) {
            return;
          }
          const remaining = new Map(entry.snapshot.pending);
          remaining.delete(requestId);
          const patch: Partial<DeckSaveSnapshot> = { pending: remaining };
          if (requestId > entry.lastSettledRequest) {
            entry.lastSettledRequest = requestId;
            patch.lastFailure = error;
          }
          if (!error && requestId > entry.lastSavedRequest) {
            entry.lastSavedRequest = requestId;
            patch.savedSignature = signature;
            const cached = getCachedDeck(deckId);
            if (cached) {
              setCachedDeck(deckId, { ...cached, savedSignature: signature });
            }
          }
          publish(entry, patch);
        },
      );
    },
  };
  return registry;
}

const registries = new WeakMap<SessionStore, WeakMap<WebClient, ReturnType<typeof createDeckSaveRegistry>>>();

export function getDeckSaveRegistry(store: SessionStore, client: WebClient) {
  let clients = registries.get(store);
  if (!clients) {
    clients = new WeakMap();
    registries.set(store, clients);
  }
  let registry = clients.get(client);
  if (!registry) {
    registry = createDeckSaveRegistry(store, client);
    clients.set(client, registry);
  }
  return registry;
}
