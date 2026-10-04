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
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router-dom';

import { ShortcutProvider } from '@app/feature-widgets/shortcuts';

import { renderWithProviders, connected31State, connectedState, disconnectedState } from '../../__test-utils__';
import Decks from './Decks';
import type { DecksLocationState } from './deckShortcuts';

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
    }, expect.any(String)));
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
      store.dispatch(server.Actions.deckShareCreated({
        requestId: vi.mocked(webClient.request.session.deckShareCreate).mock.calls.at(-1)![1],
        share: create(Response_DeckShareCreateSchema, { token: 'late' }),
      }));
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
    }, expect.any(String)));
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

describe('Decks shortcuts', () => {
  it('opens the create dialog on New Deck (Ctrl+Alt+N) and the import dialog on Load Deck (Ctrl+O)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ShortcutProvider><Decks /></ShortcutProvider>, { preloadedState: connectedState, route: '/decks' });

    await user.keyboard('{Control>}{Alt>}n{/Alt}{/Control}');
    expect(screen.getByRole('dialog', { name: 'CreateDeckDialog.title' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.keyboard('{Control>}o{/Control}');
    expect(screen.getByRole('dialog', { name: 'ImportDeckDialog.title' })).toBeInTheDocument();
  });

  it('opens the dialog the editor asked for on arrival', async () => {
    function EditorShortcut() {
      const navigate = useNavigate();
      const state: DecksLocationState = { open: 'import' };
      return <button type="button" onClick={() => navigate('/decks', { state })}>Load deck</button>;
    }
    renderWithProviders(<><EditorShortcut /><Decks /></>, { preloadedState: connectedState, route: '/decks' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Load deck' }));
    expect(await screen.findByRole('dialog', { name: 'ImportDeckDialog.title' })).toBeInTheDocument();
  });
});

describe('Decks delete focus', () => {
  const storage = create(Response_DeckListSchema, {
    root: create(ServerInfo_DeckStorage_FolderSchema, {
      items: [
        create(ServerInfo_DeckStorage_TreeItemSchema, { id: 3, name: 'Burn', file: create(ServerInfo_DeckStorage_FileSchema, {}) }),
        create(ServerInfo_DeckStorage_TreeItemSchema, { id: 5, name: 'Tron', file: create(ServerInfo_DeckStorage_FileSchema, {}) }),
      ],
    }),
  });

  it('moves focus to the next deck once the server drops the deleted one, not to the page', async () => {
    const user = userEvent.setup();
    const { store } = renderWithProviders(<Decks />, { preloadedState: connectedState });
    act(() => {
      store.dispatch(server.Actions.backendDecks({ deckList: storage }));
    });
    const [burnDelete] = screen.getAllByRole('button', { name: 'Decks.list.deleteDeckNamed' });
    await user.click(burnDelete);
    await user.click(screen.getByRole('button', { name: 'Common.action.delete' }));
    expect(burnDelete).toHaveFocus();

    act(() => {
      store.dispatch(server.Actions.deckDelete({ deckId: 3 }));
    });
    expect(screen.getAllByRole('button', { name: 'Decks.list.deleteDeckNamed' })).toHaveLength(1);
    expect(document.activeElement?.closest('[data-deck-id]')).toHaveAttribute('data-deck-id', '5');
  });
});
