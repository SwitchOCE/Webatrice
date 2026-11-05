import { act, renderHook } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';
import { useLayoutEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { lookupCard, parseCod } from '@app/services';
import { rootReducerMap, type RootState } from '@app/store';

import { connectedState, createMockWebClient } from '../../../__test-utils__';
import { makeReduxWebClientHookWrapper } from '../../../__test-utils__/makeHookWrapper';
import { clearDeckEditorCache, getCachedDeck, getCachedDraft, setCachedDeck, setCachedDraft } from '../deckEditorCache';
import { deckSaveSignature } from '../deckPersistence';
import { fetchPricesForCards } from '../pricing';
import type { HydratedDeck } from '../types';
import { AUTOSAVE_DEBOUNCE_MS } from './useDeckAutosave';
import { useDeckEditor, type AddCardOptions } from './useDeckEditor';
import { useDeckPricing } from './useDeckPricing';

vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  lookupCard: vi.fn(),
}));
vi.mock('../pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pricing')>()),
  fetchPricesForCards: vi.fn(() => new Promise(() => undefined)),
}));

function deferredLookup() {
  let resolve!: (value: Awaited<ReturnType<typeof lookupCard>>) => void;
  const promise = new Promise<Awaited<ReturnType<typeof lookupCard>>>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve({ found: false, source: 'unknown', name: 'Mox', printings: [] }) };
}

function cachedDeck(name: string, card: string): HydratedDeck {
  return {
    name, format: 'modern', meta: { v: 1, updatedAt: 'x', priceMissingCount: 1 },
    cards: [{ name: card, quantity: 1, category: 'main', lookupSource: 'unknown' }],
  };
}

const deckA = cachedDeck('Alpha', 'Island');
const deckB = cachedDeck('Bravo', 'Mountain');

function setup(deckId: number | null = 1, draftToken: string | null = null, onCommit?: () => void) {
  const webClient = createMockWebClient();
  const { Wrapper, store } = makeReduxWebClientHookWrapper<RootState>({
    reducer: combineReducers(rootReducerMap), preloadedState: connectedState as RootState, webClient,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter><Wrapper>{children}</Wrapper></MemoryRouter>
  );
  const hook = renderHook(({ deckId, draftToken }) => {
    const editor = useDeckEditor(deckId, draftToken);
    const pricing = useDeckPricing(editor.deck, editor.setPriceCache);
    useLayoutEffect(() => onCommit?.(), [deckId, draftToken]);
    return { editor, pricing };
  }, { wrapper, initialProps: { deckId, draftToken } });
  const open = (deckId: number | null, draftToken: string | null = null) => hook.rerender({ deckId, draftToken });
  return { ...hook, open, webClient, store };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearDeckEditorCache();
  vi.mocked(lookupCard).mockReset();
  vi.mocked(fetchPricesForCards).mockClear();
  setCachedDeck(1, { deck: deckA, savedSignature: deckSaveSignature(deckA) });
  setCachedDeck(2, { deck: deckB, savedSignature: deckSaveSignature(deckB) });
});

afterEach(() => vi.useRealTimers());

describe('useDeckEditor add-card lookups', () => {
  it('aborts a stale lookup during the deck-switch commit before passive effects', async () => {
    const lookup = deferredLookup();
    vi.mocked(lookupCard).mockReturnValue(lookup.promise);
    const abortedAtCommit: (boolean | undefined)[] = [];
    const { result, open } = setup(1, null, () => {
      abortedAtCommit.push(vi.mocked(lookupCard).mock.calls[0]?.[1]?.aborted);
    });
    let adding!: Promise<void>;
    act(() => {
      adding = result.current.editor.addCard('Mox');
    });
    open(2);
    expect(abortedAtCommit).toEqual([undefined, true]);
    await act(async () => {
      lookup.resolve(); await adding;
    });
  });

  it.each([false, true])('drops a stale lookup after a cached switch (return to original: %s)', async (returnToOriginal) => {
    const lookup = deferredLookup();
    vi.mocked(lookupCard).mockReturnValue(lookup.promise);
    const { result, open, webClient } = setup();
    let adding!: Promise<void>;
    act(() => {
      adding = result.current.editor.addCard('Mox');
    });
    open(2);
    if (returnToOriginal) {
      open(1);
    }
    expect(result.current.pricing.loading).toBe(true);
    expect(fetchPricesForCards).toHaveBeenCalledTimes(returnToOriginal ? 3 : 2);
    expect(fetchPricesForCards).toHaveBeenLastCalledWith(returnToOriginal ? deckA.cards : deckB.cards, expect.any(Function));
    await act(async () => {
      lookup.resolve(); await adding;
    });
    act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS));

    expect(getCachedDeck(1)?.deck).toEqual(deckA);
    expect(getCachedDeck(2)?.deck).toEqual(deckB);
    expect(result.current.editor.isModified).toBe(false);
    expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();
    open(returnToOriginal ? 2 : 1);
    expect(result.current.editor.isModified).toBe(false);
  });

  it.each(['deck switch', 'draft switch', 'unmount'] as const)('aborts every outstanding lookup on %s', async (trigger) => {
    const signals: AbortSignal[] = [];
    vi.mocked(lookupCard).mockImplementation((_name, signal) => new Promise((_resolve, reject) => {
      signals.push(signal!);
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    setCachedDraft('draft-a', deckA);
    setCachedDraft('draft-b', deckB);
    const { result, open, unmount, webClient } = trigger === 'draft switch' ? setup(null, 'draft-a') : setup();
    let adding!: Promise<void[]>;
    act(() => {
      adding = Promise.all([result.current.editor.addCard('Mox'), result.current.editor.addCard('Lotus')]);
    });
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal instanceof AbortSignal && !signal.aborted)).toBe(true);
    if (trigger === 'unmount') {
      unmount();
    } else if (trigger === 'draft switch') {
      open(null, 'draft-b');
    } else {
      open(2);
    }
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await act(async () => {
      await adding;
    });
    act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS));
    expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();
    expect(webClient.request.session.deckUpload).not.toHaveBeenCalled();
  });

  it('drops a lookup that resolves after unmount even if it ignores abort', async () => {
    const lookup = deferredLookup();
    vi.mocked(lookupCard).mockReturnValue(lookup.promise);
    const { result, unmount, webClient } = setup();
    let adding!: Promise<void>;
    act(() => {
      adding = result.current.editor.addCard('Mox');
    });
    unmount();
    await act(async () => {
      lookup.resolve(); await adding;
    });
    act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS));
    expect(getCachedDeck(1)?.deck).toEqual(deckA);
    expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();
  });

  it.each<AddCardOptions>([{}, { scryfallId: 'printing' }, { zone: 'side', scryfallId: 'printing' }])(
    'merges simultaneous adds against the latest row: %j', async (options) => {
      const first = deferredLookup();
      const second = deferredLookup();
      vi.mocked(lookupCard).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const { result, webClient } = setup();
      let adding!: Promise<void[]>;
      act(() => {
        adding = Promise.all([result.current.editor.addCard('Mox', options), result.current.editor.addCard('Mox', options)]);
      });
      await act(async () => {
        second.resolve(); await second.promise;
      });
      await act(async () => {
        first.resolve(); await adding;
      });
      expect(result.current.editor.deck?.cards.filter((card) => card.name === 'Mox')).toMatchObject([
        { name: 'Mox', quantity: 2, category: options.zone === 'side' ? 'sideboard' : 'main', scryfallId: options.scryfallId },
      ]);
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS));
      expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(1);
      expect(parseCod(vi.mocked(webClient.request.session.deckUpdate).mock.calls[0][1]).cards)
        .toHaveLength(2);
    },
  );

  it.each(['add', 'rename'] as const)('preserves a pending %s between draft storage and the handoff commit', async (edit) => {
    const lookup = deferredLookup();
    vi.mocked(lookupCard).mockReturnValue(lookup.promise);
    setCachedDraft('draft-a', deckA);
    const { result, open, webClient, store } = setup(null, 'draft-a');
    let adding: Promise<void> | undefined;
    act(() => {
      if (edit === 'add') {
        adding = result.current.editor.addCard('Mox');
      }
      result.current.editor.setName('Stored Alpha');
      result.current.editor.flushSave();
    });
    act(() => store.dispatch(server.Actions.deckUpload({
      path: '', requestId: vi.mocked(webClient.request.session.deckUpload).mock.calls[0][5],
      treeItem: { id: 42, name: 'Stored Alpha' } as Parameters<typeof server.Actions.deckUpload>[0]['treeItem'],
    })));
    expect(getCachedDraft('draft-a')).toBeUndefined();
    await act(async () => {
      if (edit === 'add') {
        lookup.resolve();
        await adding;
      } else {
        result.current.editor.setName('Renamed Alpha');
      }
    });
    const names = edit === 'add' ? ['Island', 'Mox'] : ['Island'];
    const name = edit === 'rename' ? 'Renamed Alpha' : 'Stored Alpha';
    expect(result.current.editor.deck?.cards.map((card) => card.name)).toEqual(names);
    expect(result.current.editor.deck?.name).toBe(name);
    expect(result.current.editor.isModified).toBe(true);
    open(42);
    expect(result.current.editor.deck?.cards.map((card) => card.name)).toEqual(names);
    expect(result.current.editor.deck?.name).toBe(name);
    expect(result.current.editor.isModified).toBe(false);
    expect(getCachedDraft('draft-a')).toBeUndefined();
    act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS));
    expect(webClient.request.session.deckUpload).toHaveBeenCalledTimes(1);
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(1);
    const [id, document, , , onSaved] = vi.mocked(webClient.request.session.deckUpdate).mock.calls[0];
    expect(id).toBe(42);
    expect(parseCod(document).cards.map((card) => card.name)).toEqual(names);
    expect(parseCod(document).name).toBe(name);
    act(() => onSaved?.(undefined));
    act(() => result.current.editor.incQuantity(0, 1));
    expect(result.current.editor.isModified).toBe(true);
    act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS));
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(2);
    const [nextId, nextDocument] = vi.mocked(webClient.request.session.deckUpdate).mock.calls[1];
    const nextDeck = parseCod(nextDocument);
    expect(nextId).toBe(42);
    expect(nextDeck.cards.map((card) => card.name)).toEqual(names);
    expect(nextDeck.cards[0].quantity).toBe(2);
    expect(nextDeck.name).toBe(name);
    expect(result.current.editor.isModified).toBe(false);
  });

  it('keeps an in-flight add through the draft-to-stored handoff and saves it to the stored id', async () => {
    const lookup = deferredLookup();
    vi.mocked(lookupCard).mockReturnValue(lookup.promise);
    setCachedDraft('draft-a', deckA);
    const { result, open, webClient, store } = setup(null, 'draft-a');
    let adding!: Promise<void>;
    act(() => {
      adding = result.current.editor.addCard('Mox');
      result.current.editor.setName('Stored Alpha');
      result.current.editor.flushSave();
    });
    act(() => store.dispatch(server.Actions.deckUpload({
      path: '', requestId: vi.mocked(webClient.request.session.deckUpload).mock.calls[0][5],
      treeItem: { id: 42, name: 'Stored Alpha' } as Parameters<typeof server.Actions.deckUpload>[0]['treeItem'],
    })));
    open(42);
    expect(vi.mocked(lookupCard).mock.calls[0][1]?.aborted).toBe(false);
    await act(async () => {
      lookup.resolve(); await adding;
    });
    expect(result.current.editor.deck?.cards.map((card) => card.name)).toEqual(['Island', 'Mox']);
    act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS));
    expect(webClient.request.session.deckUpload).toHaveBeenCalledTimes(1);
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(1);
    const [id, document] = vi.mocked(webClient.request.session.deckUpdate).mock.calls[0];
    expect(id).toBe(42);
    expect(parseCod(document).cards.map((card) => card.name)).toEqual(['Island', 'Mox']);
  });
});
