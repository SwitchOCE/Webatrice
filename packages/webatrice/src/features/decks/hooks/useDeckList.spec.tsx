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
import { endSession } from '@app/services/session';

import { connectedState, createMockWebClient, disconnectedState, renderWithProviders } from '../../../__test-utils__';
import { getCachedDeck, setCachedDeck } from '../deckEditorCache';
import { clearDecksListCache, useDeckList, type UseDeckList } from './useDeckList';

let latest: UseDeckList;
function Probe({ onDeckCreated, folderPath }: { onDeckCreated: (id: number) => void; folderPath?: string }) {
  latest = useDeckList({ onDeckCreated, folderPath });
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

/** Root: deck 1, folder "Modern" (public red deck 3, folder "Old" with deck 4). */
function folderTree() {
  const file = (id: number, name: string, creationTime: number, extra: { isPublic?: boolean; colorIdentity?: string } = {}) =>
    create(ServerInfo_DeckStorage_TreeItemSchema, {
      id,
      name,
      file: create(ServerInfo_DeckStorage_FileSchema, { creationTime, ...extra }),
    });
  const folder = (name: string, items: ReturnType<typeof file>[]) =>
    create(ServerInfo_DeckStorage_TreeItemSchema, { name, folder: create(ServerInfo_DeckStorage_FolderSchema, { items }) });
  return create(Response_DeckListSchema, {
    root: create(ServerInfo_DeckStorage_FolderSchema, {
      items: [
        file(1, 'Root deck', 10),
        folder('Modern', [file(3, 'Burn', 30, { isPublic: true, colorIdentity: 'R' }), folder('Old', [file(4, 'Affinity', 40)])]),
      ],
    }),
  });
}

function setup(folderPath?: string, preloadedState = connectedState) {
  const webClient = createMockWebClient();
  const onDeckCreated = vi.fn();
  const { store } = renderWithProviders(<Probe onDeckCreated={onDeckCreated} folderPath={folderPath} />, {
    preloadedState,
    webClient,
  });
  return { webClient, store, onDeckCreated };
}

beforeEach(() => {
  clearDecksListCache();
});

describe('useDeckList', () => {
  it('clears cached summaries and download requests at session end', () => {
    const webClient = createMockWebClient();
    const preloadedState = {
      ...connectedState,
      server: { ...connectedState.server, backendDecks: deckTree() },
    };
    const first = renderWithProviders(<Probe onDeckCreated={vi.fn()} />, { preloadedState, webClient });
    act(() => {
      first.store.dispatch(server.Actions.deckDownloaded({ deckId: 1, deck: COD('modern') }));
    });
    expect(latest.summaries.get(1)?.format).toBe('modern');
    expect(webClient.request.session.deckDownload).toHaveBeenCalledTimes(2);
    first.unmount();

    // Normal tab navigation must retain both caches.
    const returning = renderWithProviders(<Probe onDeckCreated={vi.fn()} />, { preloadedState, webClient });
    expect(latest.summaries.get(1)?.format).toBe('modern');
    expect(webClient.request.session.deckDownload).toHaveBeenCalledTimes(2);
    returning.unmount();

    endSession();

    renderWithProviders(<Probe onDeckCreated={vi.fn()} />, { preloadedState, webClient });
    expect.soft(latest.summaries.size).toBe(0);
    expect.soft(vi.mocked(webClient.request.session.deckDownload).mock.calls).toEqual([[2], [1], [2], [1]]);
  });

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
    const { webClient } = setup(undefined, disconnectedState);
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
    expect(parseCod(xml)).toEqual(expect.objectContaining({ name: 'Decks.list.defaultDeckName', format: 'modern' }));

    act(() => {
      store.dispatch(server.Actions.deckUpload({
        path: '',
        treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 7, name: 'Decks.list.defaultDeckName' }),
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
    setCachedDeck(4, { deck: { name: 'x', meta: { v: 1, updatedAt: 'x' }, cards: [], format: '' }, savedSignature: null });
    act(() => latest.deleteDeck({ id: 4, name: 'x', path: '', creationTime: 0, visibility: 'private' }));
    expect(webClient.request.session.deckDel).toHaveBeenCalledWith(4);
    expect(getCachedDeck(4)).toBeUndefined();
  });

  describe('folders', () => {
    it('shows one folder level and downloads only its decks', () => {
      const { webClient, store } = setup('Modern');
      act(() => {
        store.dispatch(server.Actions.backendDecks({ deckList: folderTree() }));
      });
      expect(latest.folder.path).toBe('Modern');
      expect(latest.folder.folders.map((f) => [f.name, f.deckCount])).toEqual([['Old', 1]]);
      expect(latest.decks.map((d) => d.name)).toEqual(['Burn']);
      expect(vi.mocked(webClient.request.session.deckDownload).mock.calls).toEqual([[3]]);
      expect(latest.folderPaths).toEqual(['', 'Modern', 'Modern/Old']);
      expect(latest.decksUnder('Modern').map((d) => d.id)).toEqual([3, 4]);
    });

    it('creates and imports decks into the shown folder', () => {
      const { webClient, store, onDeckCreated } = setup('Modern');
      act(() => {
        store.dispatch(server.Actions.backendDecks({ deckList: folderTree() }));
      });
      act(() => latest.createDeck('Zoo', 'modern'));
      expect(vi.mocked(webClient.request.session.deckUpload).mock.calls[0].slice(0, 2)).toEqual(['Modern', 0]);

      act(() => {
        store.dispatch(server.Actions.deckUpload({
          path: 'Modern',
          treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 9, name: 'Zoo' }),
        }));
      });
      expect(onDeckCreated).toHaveBeenCalledWith(9);
    });

    it('creates and deletes folders with deckNewDir / deckDelDir, forgetting the deleted decks', () => {
      const { webClient, store } = setup('Modern');
      act(() => {
        store.dispatch(server.Actions.backendDecks({ deckList: folderTree() }));
      });
      act(() => latest.createFolder('Sideboard plans'));
      expect(webClient.request.session.deckNewDir).toHaveBeenCalledWith('Modern', 'Sideboard plans');

      setCachedDeck(4, { deck: { name: 'x', meta: { v: 1, updatedAt: 'x' }, cards: [], format: '' }, savedSignature: null });
      act(() => latest.deleteFolder('Modern/Old'));
      expect(webClient.request.session.deckDelDir).toHaveBeenCalledWith('Modern/Old');
      expect(getCachedDeck(4)).toBeUndefined();

      act(() => latest.deleteFolder(''));
      expect(webClient.request.session.deckDelDir).toHaveBeenCalledTimes(1);
    });

    it('moves a deck by uploading a copy into the target, then deleting the original', () => {
      const { webClient, store, onDeckCreated } = setup('Modern');
      act(() => {
        store.dispatch(server.Actions.backendDecks({ deckList: folderTree() }));
        store.dispatch(server.Actions.deckDownloaded({ deckId: 3, deck: COD('modern') }));
      });
      vi.mocked(webClient.request.session.deckDownload).mockClear();

      act(() => latest.moveDeck(latest.decks[0], 'Modern/Old'));
      expect(webClient.request.session.deckDownload).toHaveBeenCalledWith(3);
      expect(webClient.request.session.deckUpload).not.toHaveBeenCalled();

      act(() => {
        store.dispatch(server.Actions.deckDownloaded({ deckId: 3, deck: COD('modern') }));
      });
      // Visibility and color identity are kept: the copy is a new deck row.
      expect(webClient.request.session.deckUpload).toHaveBeenCalledWith('Modern/Old', 0, COD('modern'), true, 'R');
      expect(webClient.request.session.deckDel).not.toHaveBeenCalled();

      act(() => {
        store.dispatch(server.Actions.deckUpload({
          path: 'Modern/Old',
          treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 12, name: 'D' }),
        }));
      });
      expect(webClient.request.session.deckDel).toHaveBeenCalledWith(3);
      expect(latest.summaries.get(12)).toEqual(expect.objectContaining({ format: 'modern' }));
      expect(onDeckCreated).not.toHaveBeenCalled();
    });

    function startMove(store: ReturnType<typeof setup>['store']) {
      act(() => {
        store.dispatch(server.Actions.backendDecks({ deckList: folderTree() }));
      });
      act(() => latest.moveDeck(latest.decks[0], 'Modern/Old'));
      act(() => {
        store.dispatch(server.Actions.deckDownloaded({ deckId: 3, deck: COD('modern') }));
      });
    }

    it('keeps the original when the copy fails, and never pairs a later answer with the failed move', () => {
      const { webClient, store, onDeckCreated } = setup('Modern');
      startMove(store);

      act(() => {
        store.dispatch(server.Actions.deckUploadFailed({ path: 'Modern/Old', responseCode: 17 }));
      });
      expect(latest.storageError).toBe('Decks.moveFailed');

      // An upload answer that matches nothing pending (another client's)
      // must not settle the move.
      act(() => {
        store.dispatch(server.Actions.deckUpload({
          path: 'Modern/Old',
          treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 13, name: 'D' }),
        }));
      });
      expect(webClient.request.session.deckDel).not.toHaveBeenCalled();
      expect(onDeckCreated).not.toHaveBeenCalled();

      act(() => latest.dismissStorageError());
      expect(latest.storageError).toBeNull();
    });

    it('ignores an unmatched answer while a move waits, and matches a nameless import by the server\'s name', () => {
      const { webClient, store, onDeckCreated } = setup('Modern');
      startMove(store);
      act(() => {
        latest.importDeck('<cockatrice_deck version="1"><zone name="main"/></cockatrice_deck>');
      });

      act(() => {
        store.dispatch(server.Actions.deckUpload({
          path: 'Modern',
          treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 20, name: 'Unnamed deck' }),
        }));
      });
      expect(onDeckCreated).toHaveBeenCalledWith(20);
      expect(webClient.request.session.deckDel).not.toHaveBeenCalled();

      act(() => {
        store.dispatch(server.Actions.deckUpload({
          path: 'Elsewhere',
          treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 21, name: 'D' }),
        }));
      });
      expect(webClient.request.session.deckDel).not.toHaveBeenCalled();
    });

    it('drops a move whose download fails, so a later download does not run it', () => {
      const { webClient, store } = setup('Modern');
      act(() => {
        store.dispatch(server.Actions.backendDecks({ deckList: folderTree() }));
      });
      act(() => latest.moveDeck(latest.decks[0], 'Modern/Old'));
      act(() => {
        store.dispatch(server.Actions.deckDownloadFailed({ deckId: 3, responseCode: 17 }));
      });
      expect(latest.storageError).toBe('Decks.moveFailed');

      act(() => {
        store.dispatch(server.Actions.deckDownloaded({ deckId: 3, deck: COD('modern') }));
      });
      expect(webClient.request.session.deckUpload).not.toHaveBeenCalled();
    });

    it('does not move a deck into its own folder', () => {
      const { webClient, store } = setup('Modern');
      act(() => {
        store.dispatch(server.Actions.backendDecks({ deckList: folderTree() }));
      });
      vi.mocked(webClient.request.session.deckDownload).mockClear();
      act(() => latest.moveDeck(latest.decks[0], 'Modern'));
      expect(webClient.request.session.deckDownload).not.toHaveBeenCalled();
    });
  });

  it('refresh drops summaries and editor copies and re-requests everything', () => {
    const { webClient, store } = setup();
    act(() => {
      store.dispatch(server.Actions.backendDecks({ deckList: deckTree() }));
      store.dispatch(server.Actions.deckDownloaded({ deckId: 1, deck: COD('modern') }));
    });
    setCachedDeck(1, { deck: { name: 'x', meta: { v: 1, updatedAt: 'x' }, cards: [], format: '' }, savedSignature: null });

    act(() => latest.refresh());

    expect(latest.summaries.size).toBe(0);
    expect(getCachedDeck(1)).toBeUndefined();
    expect(webClient.request.session.deckList).toHaveBeenCalledTimes(2);
  });
});


describe('sparse storage acknowledgements', () => {
  it('preserves color identity through edit then move', () => {
    const { store, webClient } = setup('Modern');
    act(() => store.dispatch(server.Actions.backendDecks({ deckList: folderTree() })));
    act(() => store.dispatch(server.Actions.deckUpdated({ deckId: 3, treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, {
      id: 3, name: 'Burn', file: { creationTime: 50, isPublic: true },
    }) })));
    act(() => latest.moveDeck(latest.decks[0], ''));
    act(() => store.dispatch(server.Actions.deckDownloaded({ deckId: 3, deck: COD('modern') })));
    expect(webClient.request.session.deckUpload).toHaveBeenLastCalledWith('', 0, COD('modern'), true, 'R');
  });

  it('refetches unknown metadata before moving a newly moved deck again', () => {
    const { store, webClient } = setup('Modern');
    act(() => store.dispatch(server.Actions.backendDecks({ deckList: folderTree() })));
    act(() => latest.moveDeck(latest.decks[0], ''));
    act(() => store.dispatch(server.Actions.deckDownloaded({ deckId: 3, deck: COD('modern') })));
    act(() => store.dispatch(server.Actions.deckUpload({ path: '', treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, {
      id: 8, name: 'D', file: { creationTime: 60, isPublic: true },
    }) })));
    vi.clearAllMocks();
    act(() => latest.moveDeck(latest.decksUnder('').find((d) => d.id === 8)!, 'Modern/Old'));
    expect(webClient.request.session.deckList).toHaveBeenCalledOnce();
    expect(webClient.request.session.deckUpload).not.toHaveBeenCalled();
    const listed = folderTree();
    listed.root!.items.push(create(ServerInfo_DeckStorage_TreeItemSchema, {
      id: 8, name: 'D', file: { creationTime: 60, isPublic: true, colorIdentity: 'R' },
    }));
    act(() => store.dispatch(server.Actions.backendDecks({ deckList: listed })));
    act(() => store.dispatch(server.Actions.deckDownloaded({ deckId: 8, deck: COD('modern') })));
    expect(webClient.request.session.deckUpload).toHaveBeenLastCalledWith('Modern/Old', 0, COD('modern'), true, 'R');
  });
});
