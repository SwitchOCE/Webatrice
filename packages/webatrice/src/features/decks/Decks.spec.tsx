import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { server } from '@cockatrice/datatrice';
import {
  Response_DeckListSchema,
  Response_DeckShareCreateSchema,
  Response_ResponseCode,
  ServerInfo_DeckStorage_FileSchema,
  ServerInfo_DeckStorage_FolderSchema,
  ServerInfo_DeckStorage_TreeItemSchema,
} from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { renderWithProviders, connected31State, connectedState, disconnectedState } from '../../__test-utils__';
import Decks from './Decks';

// Share links name the server this session logged into: the selected known host.
vi.mock('@app/feature-widgets/known-hosts', async (importOriginal) => ({
  ...await importOriginal<typeof import('@app/feature-widgets/known-hosts')>(),
  useKnownHosts: () => ({ status: 'loaded', value: { hosts: [], selectedHost: { host: 'server.example', port: '4748' } } }),
}));

// Piece 2 coverage: smoke-test the new MyDecks list. Full RTL
// coverage (create/delete flows, useReduxEffect navigation) lives in
// integration tests to be added alongside Piece 3.
describe('Decks (MyDecks page)', () => {
  it('renders the page header + New Deck button when connected', () => {
    renderWithProviders(<Decks />, { preloadedState: connectedState });
    expect(screen.getByRole('heading', { name: 'Decks.list.title' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Decks.list.newDeck/ }).length).toBeGreaterThan(0);
  });

  it('shows the loading state while backendDecks is null', () => {
    renderWithProviders(<Decks />, { preloadedState: connectedState });
    expect(screen.getByText('Decks.list.loading')).toBeInTheDocument();
  });

  it('replaces the spinner with the failure reason when the deck list fails', () => {
    const { store } = renderWithProviders(<Decks />, { preloadedState: connectedState });
    act(() => {
      store.dispatch(server.Actions.deckListFailed({
        responseCode: Response_ResponseCode.RespNotConnected,
        failure: WebsocketTypes.CommandFailure.Timeout,
      }));
    });
    expect(screen.queryByText('Decks.list.loading')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('CommandFailure.timeout');
  });

  it('shows the generic list error for a server rejection, and Retry re-requests the list', () => {
    const { store, webClient } = renderWithProviders(<Decks />, { preloadedState: connectedState });
    vi.mocked(webClient.request.session.deckList).mockClear();
    act(() => {
      store.dispatch(server.Actions.deckListFailed({ responseCode: Response_ResponseCode.RespInternalError }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Decks.listError');

    fireEvent.click(screen.getByRole('button', { name: /Decks.retry/ }));
    expect(webClient.request.session.deckList).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Decks.list.loading')).toBeInTheDocument();
  });

  it('still renders the page shell when disconnected (AuthGuard does not blank the page)', () => {
    renderWithProviders(<Decks />, { preloadedState: disconnectedState });
    expect(screen.getByRole('heading', { name: 'Decks.list.title' })).toBeInTheDocument();
  });
});

describe('Decks sharing (Servatrice 3.1)', () => {
  const storage = create(Response_DeckListSchema, {
    root: create(ServerInfo_DeckStorage_FolderSchema, {
      items: [
        create(ServerInfo_DeckStorage_TreeItemSchema, {
          id: 3, name: 'Burn', file: create(ServerInfo_DeckStorage_FileSchema, { creationTime: 1, isPublic: true }),
        }),
        create(ServerInfo_DeckStorage_TreeItemSchema, {
          name: 'Cube',
          folder: create(ServerInfo_DeckStorage_FolderSchema, {
            items: [
              create(ServerInfo_DeckStorage_TreeItemSchema, { id: 4, name: 'Elves', file: create(ServerInfo_DeckStorage_FileSchema, {}) }),
            ],
          }),
        }),
      ],
    }),
  });

  function renderLoaded(preloadedState = connected31State) {
    const rendered = renderWithProviders(<Decks />, { preloadedState });
    act(() => {
      rendered.store.dispatch(server.Actions.backendDecks({ deckList: storage }));
    });
    return rendered;
  }

  it('shares a stored deck by id under desktop\'s default name', async () => {
    const { webClient } = renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'DeckSharing.shareDeckNamed' }));
    expect(screen.getByRole('textbox', { name: 'DeckSharing.nameLabel' })).toHaveValue('DeckSharing.defaultDecksName');
    fireEvent.click(screen.getByRole('button', { name: /DeckSharing.create/ }));
    await waitFor(() => expect(webClient.request.session.deckShareCreate).toHaveBeenCalledWith({
      name: 'DeckSharing.defaultDecksName',
      items: [{ deckId: 3 }],
    }));
  });

  it('drops a share answered after the dialog was cancelled: nothing is copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { store, webClient } = renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'DeckSharing.shareDeckNamed' }));
    fireEvent.click(screen.getByRole('button', { name: /DeckSharing.create/ }));
    await waitFor(() => expect(webClient.request.session.deckShareCreate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'DeckSharing.cancel' }));

    await act(async () => {
      store.dispatch(server.Actions.deckShareCreated({ share: create(Response_DeckShareCreateSchema, { token: 'late' }) }));
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('shares a folder\'s decks by path', async () => {
    const { webClient } = renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'DeckSharing.shareFolderNamed' }));
    fireEvent.click(screen.getByRole('button', { name: /DeckSharing.create/ }));
    await waitFor(() => expect(webClient.request.session.deckShareCreate).toHaveBeenCalledWith({
      name: 'DeckSharing.defaultDecksName',
      folderPath: 'Cube',
    }));
  });

  it('publishes and unpublishes, and reports a rejected change', () => {
    const { webClient, store } = renderLoaded();
    const [folderToggle, deckToggle] = screen.getAllByRole('button', { name: 'DeckSharing.publishNamed' });
    fireEvent.click(deckToggle);
    fireEvent.click(folderToggle);
    expect(vi.mocked(webClient.request.session.deckSetVisibility).mock.calls).toEqual([
      [{ deckId: 3, isPublic: false }],
      [{ folderPath: 'Cube', isPublic: true }],
    ]);
    expect(screen.getByText('DeckSharing.public')).toBeInTheDocument();

    act(() => {
      store.dispatch(server.Actions.sessionCommandFailed({ command: 'deckSetVisibility', target: 'Cube', responseCode: 11 }));
    });
    expect(screen.getByText('DeckSharing.visibilityFailed')).toBeInTheDocument();
  });

  it('lists the user\'s share links on request', () => {
    const { webClient } = renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /DeckShareLinks.open/ }));
    expect(webClient.request.session.deckShareListMine).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'DeckShareLinks.title' })).toBeInTheDocument();
  });

  it('offers none of it on a 3.0 server', () => {
    renderLoaded(connectedState);
    expect(screen.queryByRole('button', { name: 'DeckSharing.shareDeckNamed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'DeckSharing.publishNamed' })).toBeNull();
    expect(screen.queryByRole('button', { name: /DeckShareLinks.open/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /OpenShareLink.open/ })).toBeNull();
  });
});

