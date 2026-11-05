import { act } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';

import { server } from '@cockatrice/datatrice';
import {
  Response_DeckListSchema,
  ServerInfo_DeckStorage_FileSchema,
  ServerInfo_DeckStorage_FolderSchema,
  ServerInfo_DeckStorage_TreeItemSchema,
} from '@cockatrice/sockatrice/generated';
import { parseCod } from '@app/services';
import type { BracketAssessment } from '@app/types';

import { connectedState, createMockWebClient, renderWithProviders } from '../../../__test-utils__';
import { clearDeckEditorCache, getCachedDeck, setCachedDeck } from '../deckEditorCache';
import { deckSaveSignature } from '../deckPersistence';
import { dropCleanCachedDeck, getDeckSaveRegistry } from '../deckSaveRegistry';
import { hydrateDeck } from '../hydrate';
import type { HydratedDeck } from '../types';
import { useDeckEditor, type UseDeckEditor } from './useDeckEditor';
import { clearDecksListCache, useDeckList, type UseDeckList } from './useDeckList';
import { useDeckPricing } from './useDeckPricing';

vi.mock('../hydrate', async (original) => ({
  ...await original<typeof import('../hydrate')>(), hydrateDeck: vi.fn(),
}));

let editor: UseDeckEditor;
let list: UseDeckList;
let loadingPrices: boolean;
let epoch = 1_800_000_000_000;

function Editor() {
  editor = useDeckEditor(5);
  loadingPrices = useDeckPricing(editor.deck, editor.setPriceCache).loading;
  return null;
}

const onDeckCreated = vi.fn();
function Grid() {
  list = useDeckList({ onDeckCreated });
  return null;
}

function tree(viewedTime = 10) {
  const file = (id: number, creationTime: number) => create(ServerInfo_DeckStorage_TreeItemSchema, {
    id, name: `Deck ${id}`, file: create(ServerInfo_DeckStorage_FileSchema, { creationTime }),
  });
  return create(Response_DeckListSchema, {
    root: create(ServerInfo_DeckStorage_FolderSchema, { items: [file(5, viewedTime), file(6, 20)] }),
  });
}

function setup(cached = true, grid = false) {
  const deck: HydratedDeck = {
    name: 'Stored', format: 'modern', meta: { v: 1, updatedAt: 'x', priceUsd: 12 },
    cards: [{ name: `Card ${epoch}`, quantity: 2, category: 'main', lookupSource: 'scryfall' }],
  };
  if (cached) {
    setCachedDeck(5, { deck, savedSignature: deckSaveSignature(deck) });
  }
  vi.mocked(hydrateDeck).mockResolvedValue(deck);
  const webClient = createMockWebClient();
  const view = renderWithProviders(<>{grid && <Grid />}<Editor /></>, {
    webClient,
    preloadedState: { ...connectedState, server: { ...connectedState.server, backendDecks: tree() } },
  });
  return { ...view, webClient, deck };
}

function response(deck: HydratedDeck, usd: string | null = '8.00') {
  return new Response(JSON.stringify({ data: [{ id: `id-${epoch}`, name: deck.cards[0].name, prices: { usd } }] }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(epoch += 1_000_000);
  clearDeckEditorCache();
  clearDecksListCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([true, false])('resolving a changed price leaves an opened deck clean without sending an update (cached: %s)', async (cached) => {
  let resolve!: (res: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => {
    resolve = done;
  })));
  const { store, webClient, deck } = setup(cached);
  if (!cached) {
    const requestId = vi.mocked(webClient.request.session.deckDownload).mock.lastCall?.[1];
    await act(async () => store.dispatch(server.Actions.deckDownloaded({
      deckId: 5, deck: '<cockatrice_deck><format>modern</format></cockatrice_deck>', requestId,
    })));
  }
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(editor.deck?.meta.priceUsd).toBe(12);
  expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();

  await act(async () => resolve(response(deck)));
  expect(loadingPrices).toBe(false);
  expect(editor.deck?.meta.priceUsd).toBe(16);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();
  expect(editor.isModified).toBe(false);
  expect(editor.canUndo).toBe(false);
  dropCleanCachedDeck(getDeckSaveRegistry(store, webClient), 5);
  expect(getCachedDeck(5)).toBeUndefined();
});

it.each([429, 500])('keeps the stored price and sends no command after Scryfall returns %s', async (status) => {
  const fetch = vi.fn(async () => new Response('', { status, headers: { 'Retry-After': '1' } }));
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { webClient, unmount } = setup();
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(fetch).toHaveBeenCalledTimes(status === 429 ? 3 : 1);
  expect(loadingPrices).toBe(false);
  expect(editor.deck?.meta.priceUsd).toBe(12);
  expect(editor.isModified).toBe(false);
  unmount();
  expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();
});

it('opening and closing a deck keeps its position in the grid', async () => {
  let resolve!: (res: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => {
    resolve = done;
  })));
  const { store, webClient, deck, rerender } = setup(true, true);
  vi.mocked(webClient.request.session.deckUpdate).mockImplementation((_id, _xml, _public, _colors, done) => {
    store.dispatch(server.Actions.backendDecks({ deckList: tree(30) }));
    done?.(null);
  });
  expect(list.decks.map((d) => d.id)).toEqual([6, 5]);
  await act(async () => vi.advanceTimersByTimeAsync(100));
  await act(async () => resolve(response(deck)));
  rerender(<Grid />);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(list.decks.map((d) => [d.id, d.creationTime])).toEqual([[6, 20], [5, 10]]);
  expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();
});

it('a real edit saves the latest derived price and bracket data in its XML', async () => {
  let resolve!: (res: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => {
    resolve = done;
  })));
  const { webClient, deck } = setup();
  await act(async () => vi.advanceTimersByTimeAsync(100));
  await act(async () => resolve(response(deck)));
  const assessment: BracketAssessment = {
    level: 3, fingerprint: 'current', gameChangers: [], turns: [], turnsRestricted: [],
    denial: [], denialRestricted: [], earlyCombos: [], lateCombos: [],
  };
  act(() => editor.setBracketAssessment(assessment));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(editor.isModified).toBe(false);
  expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();

  act(() => editor.setName('Edited'));
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(webClient.request.session.deckUpdate).toHaveBeenCalledOnce();
  const command = vi.mocked(webClient.request.session.deckUpdate).mock.lastCall!;
  const saved = parseCod(command[1]);
  expect(saved.name).toBe('Edited');
  expect(saved.meta).toMatchObject({ priceUsd: 16, bracketLevel: 3 });
  expect(saved.bracketAssessment).toEqual(assessment);
  act(() => command[4]!(null));
});
