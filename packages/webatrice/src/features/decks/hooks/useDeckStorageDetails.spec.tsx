import { act, renderHook, waitFor } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';

import { server } from '@cockatrice/datatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { parseCod } from '@app/services';
import { rootReducerMap, type RootState } from '@app/store';

import { connectedState, createMockWebClient } from '../../../__test-utils__';
import { makeReduxWebClientHookWrapper } from '../../../__test-utils__/makeHookWrapper';
import { hydrateDeck } from '../hydrate';
import { clearDeckEditorCache, getCachedDeck, setCachedDeck } from '../deckEditorCache';
import { getDeckSaveRegistry } from '../deckSaveRegistry';
import { deckSaveSignature } from '../deckPersistence';
import type { HydratedDeck } from '../types';
import { useDeckStorageDetails } from './useDeckStorageDetails';

vi.mock('../hydrate', () => ({ hydrateDeck: vi.fn() }));
const xml = '<?xml version="1.0"?>\r\n<cockatrice_deck><deckname>Deck</deckname>'
  + '<bannerCard providerId="old">Island</bannerCard><comments><![CDATA[Keep <this>]]></comments>'
  + '<zone name="unknown"><card number="04" name="Swamp" extra="keep"/></zone></cockatrice_deck>\r\n';
const hydrated = (): HydratedDeck => ({ ...parseCod(xml), format: 'commander',
  cards: [{ name: 'Swamp', quantity: 4, category: 'main', lookupSource: 'unknown' }] });

beforeEach(() => {
  clearDeckEditorCache();
  vi.mocked(hydrateDeck).mockResolvedValue(hydrated());
});

function setup(activate = true) {
  const client = createMockWebClient();
  const { Wrapper, store } = makeReduxWebClientHookWrapper<RootState>({
    reducer: combineReducers(rootReducerMap), preloadedState: connectedState as RootState, webClient: client,
  });
  const onSaved = vi.fn();
  const hook = renderHook(({ id, document }) => useDeckStorageDetails(id, document, onSaved, 'UB'), {
    wrapper: Wrapper, initialProps: { id: 7, document: xml },
  });
  if (activate) {
    act(() => {
      void hook.result.current.activate();
    });
  }
  const respond = (error: { responseCode: number } | null = null) => {
    act(() => vi.mocked(client.request.session.deckUpdate).mock.calls.at(-1)![4]!(error));
  };
  return { ...hook, client, store, onSaved, respond };
}

it('hydrates the stored file and saves only the banner bytes without altering server visibility or color identity', async () => {
  const ctx = setup();
  await waitFor(() => expect(ctx.result.current.disabled).toBe(false));
  setCachedDeck(7, { deck: hydrated(), savedSignature: 'old' });
  let saved!: Promise<boolean>;
  act(() => {
    saved = ctx.result.current.save({ banner: { name: 'Swamp', providerId: 'new' } });
  });
  const expected = xml.replace('<bannerCard providerId="old">Island</bannerCard>', '<bannerCard providerId="new">Swamp</bannerCard>');
  expect(ctx.client.request.session.deckUpdate).toHaveBeenCalledWith(7, expected, undefined, 'UB', expect.any(Function));
  expect(ctx.onSaved).not.toHaveBeenCalled();
  expect(getCachedDeck(7)).toBeUndefined();
  ctx.respond();
  await act(async () => {
    expect(await saved).toBe(true);
  });
  expect(ctx.onSaved).toHaveBeenCalledExactlyOnceWith(7, expected);
  expect(getCachedDeck(7)).toBeUndefined();
});

it('keeps failures visible and retries the same edit', async () => {
  const ctx = setup();
  await waitFor(() => expect(ctx.result.current.disabled).toBe(false));
  let saved!: Promise<boolean>;
  act(() => {
    saved = ctx.result.current.save({ tags: ['Ramp'] });
  });
  ctx.respond({ responseCode: 3 });
  await act(async () => {
    expect(await saved).toBe(false);
  });
  expect(ctx.result.current.error).toBeTruthy();
  expect(ctx.onSaved).not.toHaveBeenCalled();
  act(() => {
    saved = ctx.result.current.save({ tags: ['Ramp'] });
  });
  expect(ctx.client.request.session.deckUpdate).toHaveBeenCalledTimes(2);
  ctx.respond();
  await act(async () => {
    expect(await saved).toBe(true);
  });
});

it('ignores old hydration after changing decks', async () => {
  let finish!: (deck: HydratedDeck) => void;
  vi.mocked(hydrateDeck).mockImplementationOnce(() => new Promise((resolve) => {
    finish = resolve;
  }));
  const ctx = setup();
  const next = { ...hydrated(), name: 'Next' };
  vi.mocked(hydrateDeck).mockResolvedValue(next);
  ctx.rerender({ id: 8, document: xml.replace('Deck', 'Next') });
  act(() => {
    void ctx.result.current.activate();
  });
  await waitFor(() => expect(ctx.result.current.deck?.name).toBe('Next'));
  await act(async () => finish(hydrated()));
  expect(ctx.result.current.deck?.name).toBe('Next');
});

it('blocks storage edits over pending editor changes', async () => {
  const ctx = setup();
  await waitFor(() => expect(ctx.result.current.disabled).toBe(false));
  act(() => getDeckSaveRegistry(ctx.store, ctx.client).markDirty(7));
  await act(async () => expect(await ctx.result.current.save({ tags: ['Ramp'] })).toBe(false));
  expect(ctx.client.request.session.deckUpdate).not.toHaveBeenCalled();
});

it('keeps controls disabled when an existing editor save has failed', async () => {
  const ctx = setup();
  await waitFor(() => expect(ctx.result.current.disabled).toBe(false));
  act(() => getDeckSaveRegistry(ctx.store, ctx.client).save(7, { ...hydrated(), name: 'Unsaved editor changes' }));
  ctx.respond({ responseCode: 3 });
  expect(ctx.result.current.disabled).toBe(true);
  await act(async () => expect(await ctx.result.current.save({ tags: ['Ramp'] })).toBe(false));
  expect(ctx.client.request.session.deckUpdate).toHaveBeenCalledTimes(1);
});

it('does not apply late save results after disconnect', async () => {
  const ctx = setup();
  await waitFor(() => expect(ctx.result.current.disabled).toBe(false));
  let saved!: Promise<boolean>;
  act(() => {
    saved = ctx.result.current.save({ tags: ['Ramp'] });
  });
  act(() => ctx.store.dispatch(server.Actions.updateStatus({
    status: { state: WebsocketTypes.StatusEnum.DISCONNECTED, description: null },
  })));
  ctx.respond();
  await act(async () => expect(await saved).toBe(false));
  expect(ctx.onSaved).not.toHaveBeenCalled();
});

it('updates the document cache when a successful save arrives after the row unmounts', async () => {
  const ctx = setup();
  await waitFor(() => expect(ctx.result.current.disabled).toBe(false));
  setCachedDeck(7, { deck: hydrated(), savedSignature: 'old' });
  let saved!: Promise<boolean>;
  act(() => {
    saved = ctx.result.current.save({ tags: ['Ramp'] });
  });
  expect(getCachedDeck(7)).toBeUndefined();
  ctx.unmount();
  ctx.respond();
  expect(await saved).toBe(false);
  expect(ctx.onSaved).toHaveBeenCalledExactlyOnceWith(7, expect.stringContaining('<tag>Ramp</tag>'));
  expect(getCachedDeck(7)).toBeUndefined();
});

it('downloads the newer editor save before patching cached storage details', async () => {
  const ctx = setup();
  await waitFor(() => expect(ctx.result.current.disabled).toBe(false));
  const newerXml = xml.replace('number="04"', 'number="09"');
  const newerDeck = { ...hydrated(), cards: [{ ...hydrated().cards[0], quantity: 9 }] };
  act(() => getDeckSaveRegistry(ctx.store, ctx.client).markSaved(7, deckSaveSignature(newerDeck)));
  vi.mocked(hydrateDeck).mockResolvedValue(newerDeck);
  let saved!: Promise<boolean>;
  act(() => {
    saved = ctx.result.current.save({ banner: { name: 'Swamp', providerId: 'new' } });
  });
  expect(ctx.client.request.session.deckUpdate).not.toHaveBeenCalled();
  expect(ctx.client.request.session.deckDownload).toHaveBeenCalledWith(7, expect.any(String));
  const requestId = vi.mocked(ctx.client.request.session.deckDownload).mock.calls.at(-1)![1];
  act(() => ctx.store.dispatch(server.Actions.deckDownloaded({ deckId: 7, deck: newerXml, requestId: 'unrelated' })));
  expect(ctx.client.request.session.deckUpdate).not.toHaveBeenCalled();
  act(() => ctx.store.dispatch(server.Actions.deckDownloaded({ deckId: 7, deck: newerXml, requestId })));
  ctx.rerender({ id: 7, document: newerXml });
  await waitFor(() => expect(ctx.client.request.session.deckUpdate).toHaveBeenCalled());
  const expected = newerXml.replace('<bannerCard providerId="old">Island</bannerCard>', '<bannerCard providerId="new">Swamp</bannerCard>');
  expect(ctx.client.request.session.deckUpdate).toHaveBeenCalledWith(7, expected, undefined, 'UB', expect.any(Function));
  ctx.respond();
  await act(async () => expect(await saved).toBe(true));
  expect(ctx.onSaved).toHaveBeenCalledExactlyOnceWith(7, expected);
});

it('does not hydrate or initialize a registry entry until the first interaction', async () => {
  const ctx = setup(false);
  expect(hydrateDeck).not.toHaveBeenCalled();
  expect(getDeckSaveRegistry(ctx.store, ctx.client).getSnapshot(7).savedSignature).toBeNull();
  await act(async () => {
    await ctx.result.current.activate();
  });
  expect(hydrateDeck).toHaveBeenCalledOnce();
  expect(getDeckSaveRegistry(ctx.store, ctx.client).getSnapshot(7).savedSignature).toBe(deckSaveSignature(hydrated()));
  await act(async () => {
    await ctx.result.current.activate();
  });
  expect(hydrateDeck).toHaveBeenCalledOnce();
});

it('keeps a failed freshness download visible without uploading the cached document', async () => {
  const ctx = setup();
  await waitFor(() => expect(ctx.result.current.disabled).toBe(false));
  act(() => getDeckSaveRegistry(ctx.store, ctx.client).markSaved(7, 'newer-editor-save'));
  let saved!: Promise<boolean>;
  act(() => {
    saved = ctx.result.current.save({ tags: ['Ramp'] });
  });
  const requestId = vi.mocked(ctx.client.request.session.deckDownload).mock.calls.at(-1)![1];
  act(() => ctx.store.dispatch(server.Actions.deckDownloadFailed({
    deckId: 7, requestId, responseCode: 3, failure: WebsocketTypes.CommandFailure.Timeout,
  })));
  await act(async () => expect(await saved).toBe(false));
  expect(ctx.result.current.error).toBe('CommandFailure.timeout');
  expect(ctx.result.current.saving).toBe(false);
  expect(ctx.client.request.session.deckUpdate).not.toHaveBeenCalled();
  expect(ctx.onSaved).not.toHaveBeenCalled();
});

it('cancels a freshness download when the row unmounts', async () => {
  const ctx = setup();
  await waitFor(() => expect(ctx.result.current.disabled).toBe(false));
  act(() => getDeckSaveRegistry(ctx.store, ctx.client).markSaved(7, 'newer-editor-save'));
  let saved!: Promise<boolean>;
  act(() => {
    saved = ctx.result.current.save({ tags: ['Ramp'] });
  });
  const requestId = vi.mocked(ctx.client.request.session.deckDownload).mock.calls.at(-1)![1];
  ctx.unmount();
  act(() => ctx.store.dispatch(server.Actions.deckDownloaded({ deckId: 7, deck: xml, requestId })));
  expect(await saved).toBe(false);
  expect(ctx.client.request.session.deckUpdate).not.toHaveBeenCalled();
});
