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

import { connectedState, createMockWebClient, disconnectedState, renderWithProviders } from '../../../__test-utils__';
import { getCachedDeck, setCachedDeck } from '../deckEditorCache';
import { clearDecksListCache, useDeckList, type UseDeckList } from './useDeckList';

let latest: UseDeckList;
function Probe({ onDeckCreated }: { onDeckCreated: (id: number) => void }) {
  latest = useDeckList({ onDeckCreated });
  return null;
}

const COD = (format: string) =>
  `<cockatrice_deck version="1"><deckname>D</deckname><format>${format}</format>`
  + '<comments>{"v":1,"updatedAt":"x","priceUsd":3}</comments><zone name="main"/></cockatrice_deck>';

function deckTree() {
  const file = (id: number, name: string, creationTime: number) =>
    create(ServerInfo_DeckStorage_TreeItemSchema, {
      id,
      name,
      file: create(ServerInfo_DeckStorage_FileSchema, { creationTime }),
    });
  return create(Response_DeckListSchema, {
    root: create(ServerInfo_DeckStorage_FolderSchema, { items: [file(1, 'Old', 10), file(2, 'New', 20)] }),
  });
}

function setup(preloadedState = connectedState) {
  const webClient = createMockWebClient();
  const onDeckCreated = vi.fn();
  const { store } = renderWithProviders(<Probe onDeckCreated={onDeckCreated} />, {
    preloadedState,
    webClient,
  });
  return { webClient, store, onDeckCreated };
}

beforeEach(() => {
  clearDecksListCache();
});

describe('useDeckList', () => {
  it('requests the tree when connected without one', () => {
    const { webClient } = setup();
    expect(webClient.request.session.deckList).toHaveBeenCalledTimes(1);
    expect(latest.loading).toBe(true);
  });

  it('flattens the tree, downloads each deck once, and sections them by summary format', () => {
    const { webClient, store } = setup();
    act(() => {
      store.dispatch(server.Actions.backendDecks({ deckList: deckTree() }));
    });
    expect(latest.decks.map((d) => d.name)).toEqual(['New', 'Old']);
    expect(vi.mocked(webClient.request.session.deckDownload).mock.calls).toEqual([[2], [1]]);
    expect(latest.sections).toEqual([{ section: 'loading', decks: latest.decks }]);

    act(() => {
      store.dispatch(server.Actions.deckDownloaded({ deckId: 1, deck: COD('modern') }));
    });
    expect(latest.summaries.get(1)).toEqual(expect.objectContaining({ format: 'modern', usd: 3 }));
    expect(latest.sections.map((s) => s.section)).toEqual(['modern', 'loading']);
  });

  it('ignores an unreadable deck download', () => {
    const { store } = setup();
    act(() => {
      store.dispatch(server.Actions.backendDecks({ deckList: deckTree() }));
      store.dispatch(server.Actions.deckDownloaded({ deckId: 1, deck: 'not xml' }));
    });
    expect(latest.summaries.size).toBe(0);
  });

  it('refuses to create or import while disconnected, so the caller keeps its dialog open', () => {
    const { webClient } = setup(disconnectedState);
    expect(latest.createDeck('Brew', 'modern')).toBe(false);
    expect(latest.importDeck('<cockatrice_deck/>')).toBe(false);
    expect(webClient.request.session.deckUpload).not.toHaveBeenCalled();
  });

  it('creates a deck at the root and reports the id the server assigns', () => {
    const { webClient, store, onDeckCreated } = setup();
    act(() => {
      expect(latest.createDeck('', 'modern')).toBe(true);
    });

    const [path, deckId, xml] = vi.mocked(webClient.request.session.deckUpload).mock.calls[0];
    expect([path, deckId]).toEqual(['', 0]);
    expect(parseCod(xml)).toEqual(expect.objectContaining({ name: 'New Deck', format: 'modern' }));

    act(() => {
      store.dispatch(server.Actions.deckUpload({
        path: '',
        treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 7, name: 'New Deck' }),
      }));
    });
    expect(onDeckCreated).toHaveBeenCalledWith(7);
  });

  it('does not navigate for uploads it did not start', () => {
    const { store, onDeckCreated } = setup();
    act(() => {
      store.dispatch(server.Actions.deckUpload({
        path: '',
        treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 7, name: 'Autosave' }),
      }));
    });
    expect(onDeckCreated).not.toHaveBeenCalled();
  });

  it('deletes a deck and forgets its editor copy', () => {
    const { webClient } = setup();
    setCachedDeck(4, { deck: { name: 'x', meta: { v: 1, updatedAt: 'x' }, cards: [], format: '' }, savedXml: '' });
    act(() => latest.deleteDeck({ id: 4, name: 'x', path: '', creationTime: 0 }));
    expect(webClient.request.session.deckDel).toHaveBeenCalledWith(4);
    expect(getCachedDeck(4)).toBeUndefined();
  });

  it('refresh drops summaries and editor copies and re-requests everything', () => {
    const { webClient, store } = setup();
    act(() => {
      store.dispatch(server.Actions.backendDecks({ deckList: deckTree() }));
      store.dispatch(server.Actions.deckDownloaded({ deckId: 1, deck: COD('modern') }));
    });
    setCachedDeck(1, { deck: { name: 'x', meta: { v: 1, updatedAt: 'x' }, cards: [], format: '' }, savedXml: '' });

    act(() => latest.refresh());

    expect(latest.summaries.size).toBe(0);
    expect(getCachedDeck(1)).toBeUndefined();
    expect(webClient.request.session.deckList).toHaveBeenCalledTimes(2);
  });
});
