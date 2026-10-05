import { combineReducers } from '@reduxjs/toolkit';
import { server } from '@cockatrice/datatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { rootReducerMap, type RootState } from '@app/store';
import { connectedState, createMockWebClient } from '../../__test-utils__';
import { makeReduxHookWrapper } from '../../__test-utils__/makeHookWrapper';
import { clearDeckEditorCache, getCachedDeck, setCachedDeck } from './deckEditorCache';
import { createDeckSaveRegistry } from './deckSaveRegistry';
import { deckSaveSignature } from './deckPersistence';
import type { HydratedDeck } from './types';

const original: HydratedDeck = { name: 'Original', format: 'modern', cards: [], meta: { v: 1, updatedAt: 'x' } };
const first = { ...original, name: 'First' };
const second = { ...original, name: 'Second' };

function setup() {
  const client = createMockWebClient();
  const { store } = makeReduxHookWrapper<RootState>(combineReducers(rootReducerMap), connectedState as RootState);
  const registry = createDeckSaveRegistry(store, client);
  registry.connect();
  registry.initialize(7, deckSaveSignature(original));
  registry.initialize(8, deckSaveSignature(original));
  const response = (index: number) => vi.mocked(client.request.session.deckUpdate).mock.calls[index][4]!;
  return { registry, client, store, response };
}

beforeEach(() => clearDeckEditorCache());

describe('deckSaveRegistry', () => {
  it('owns identical pending signatures independently for each deck', () => {
    const { registry, response } = setup();
    registry.save(7, first);
    registry.save(8, first);
    response(1)(null);
    expect(registry.getSnapshot(8).saveState).toBe('saved');
    expect(registry.getSnapshot(7).saveState).toBe('saving');
    response(0)(null);
    expect(registry.getSnapshot(7).savedSignature).toBe(deckSaveSignature(first));
  });

  it('matches out-of-order replies to their requests without rolling back the cache', () => {
    const { registry, response } = setup();
    setCachedDeck(7, { deck: second, savedSignature: deckSaveSignature(original) });
    registry.save(7, first);
    registry.save(7, second);
    expect(registry.getSnapshot(7).pending.size).toBe(2);
    response(1)(null);
    response(0)(null);
    expect(registry.getSnapshot(7).pending.size).toBe(0);
    expect(registry.getSnapshot(7).savedSignature).toBe(deckSaveSignature(second));
    expect(getCachedDeck(7)?.savedSignature).toBe(deckSaveSignature(second));
    expect(getCachedDeck(7)?.deck).toBe(second);
  });

  it('retains a newer failure when an older request succeeds, then retries', () => {
    const { registry, response } = setup();
    registry.save(7, first);
    registry.save(7, second);
    const error = { responseCode: 1, failure: WebsocketTypes.CommandFailure.Timeout };
    response(1)(error);
    response(0)(null);
    expect(registry.getSnapshot(7).lastFailure).toEqual(error);
    expect(registry.getSnapshot(7).savedSignature).toBe(deckSaveSignature(first));
    expect(registry.getSnapshot(7).saveState).toBe('failed');
    registry.save(7, second);
    response(2)(null);
    expect(registry.getSnapshot(7).lastFailure).toBeNull();
    expect(registry.getSnapshot(7).saveState).toBe('saved');
  });

  it('does not let an older failure replace a newer success or settle a response twice', () => {
    const { registry, response } = setup();
    registry.save(7, first);
    registry.save(7, second);
    response(1)(null);
    response(0)({ responseCode: 1 });
    response(1)({ responseCode: 1 });
    expect(registry.getSnapshot(7).lastFailure).toBeNull();
    expect(registry.getSnapshot(7).saveState).toBe('saved');
  });

  it('keeps a newer debounced edit dirty when the previous save settles', () => {
    const { registry, response } = setup();
    registry.save(7, first);
    registry.markDirty(7);
    response(0)(null);
    expect(registry.getSnapshot(7).saveState).toBe('dirty');
  });

  it('resends an older pending signature when a newer save has already succeeded', () => {
    const { registry, response, client } = setup();
    registry.save(7, first);
    registry.save(7, second);
    response(1)(null);
    registry.save(7, first);
    expect(client.request.session.deckUpdate).toHaveBeenCalledTimes(3);
    response(0)(null);
    response(2)(null);
    expect(registry.getSnapshot(7).savedSignature).toBe(deckSaveSignature(first));
  });

  it.each([WebsocketTypes.StatusEnum.DISCONNECTED, WebsocketTypes.StatusEnum.DISCONNECTING])(
    'clears the session on %s and ignores late replies after reconnect', (state) => {
      const { registry, store, response } = setup();
      registry.save(7, first);
      const oldResponse = response(0);
      registry.save(8, second);
      response(1)({ responseCode: 1 });
      setCachedDeck(7, { deck: first, savedSignature: 'old session' });
      store.dispatch(server.Actions.updateStatus({ status: { state, description: null } }));
      expect(registry.getSnapshot(7).pending.size).toBe(0);
      expect(registry.getSnapshot(7).savedSignature).toBeNull();
      expect(registry.getSnapshot(8).lastFailure).toBeNull();
      expect(getCachedDeck(7)).toBeUndefined();
      store.dispatch(server.Actions.updateStatus({ status: { state: WebsocketTypes.StatusEnum.LOGGED_IN, description: null } }));
      registry.initialize(7, 'new session');
      oldResponse(null);
      expect(registry.getSnapshot(7).savedSignature).toBe('new session');
    },
  );

  it.each(['logout', 'server change'] as const)('invalidates pending responses on %s', (change) => {
    const { registry, store, response } = setup();
    registry.save(7, first);
    store.dispatch(change === 'logout' ? server.Actions.clearStore()
      : server.Actions.updateInfo({ info: { name: 'Another server', version: '1.0.0' } }));
    response(0)(null);
    expect(registry.getSnapshot(7).savedSignature).toBeNull();
    expect(registry.getSnapshot(7).pending.size).toBe(0);
  });

  it('notifies subscribers with stable snapshots and allows unsubscribing', () => {
    const { registry, response } = setup();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const before = registry.getSnapshot(7);
    expect(registry.getSnapshot(7)).toBe(before);
    registry.save(7, first);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot(7)).not.toBe(before);
    unsubscribe();
    response(0)(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
