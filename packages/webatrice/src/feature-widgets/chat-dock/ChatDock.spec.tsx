import { act, fireEvent, screen, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { server } from '@cockatrice/datatrice';
import { Event_UserMessageSchema } from '@cockatrice/sockatrice/generated';

import { connectedState, makeUser, renderWithProviders } from '../../__test-utils__';
import { getSettings, settingsStore } from '../../hooks/useSettings';
import { dispatchChatDock, getChatDockState } from '../../hooks/useChatDock';
import { UserGamesProvider } from '../user-games';
import ChatDock from './ChatDock';
import { readBoardTrayHeight } from './useChatDockController';

const state = {
  ...connectedState,
  server: {
    ...connectedState.server!,
    user: makeUser({ name: 'me', userLevel: 3 }),
    users: { alice: makeUser({ name: 'alice', userLevel: 3 }), bob: makeUser({ name: 'bob', userLevel: 3 }) },
    buddyList: { alice: makeUser({ name: 'alice', userLevel: 3 }) },
    ignoreList: {},
    messages: {},
  },
};

const receive = (store: { dispatch: (action: unknown) => unknown }, senderName: string, message: string) =>
  act(() => {
    store.dispatch(server.Actions.userMessage({
      timeReceived: 123,
      messageData: create(Event_UserMessageSchema, { senderName, receiverName: 'me', message }),
    }));
  });

const open = (name: string) => act(() => dispatchChatDock({ type: 'open', name, max: 3 }));

describe('ChatDock', () => {
  beforeEach(async () => {
    settingsStore.reset();
    await getSettings();
  });

  afterEach(() => {
    act(() => dispatchChatDock({ type: 'reset' }));
  });

  it('renders nothing until a chat is open', () => {
    renderWithProviders(<ChatDock />, { preloadedState: state });
    expect(screen.queryByRole('region', { name: 'ChatDock.region' })).not.toBeInTheDocument();
  });

  it('opens a window with the conversation and focuses its input', () => {
    renderWithProviders(<ChatDock />, { preloadedState: state });
    open('alice');
    const window = screen.getByRole('region', { name: 'ChatDock.window' });
    expect(within(window).getByRole('log', { name: 'PrivateChat.log' })).toBeInTheDocument();
    expect(within(window).getByRole('textbox', { name: 'PrivateChat.input' })).toHaveFocus();
  });

  it('minimises a window to a bar and reopens it', () => {
    renderWithProviders(<ChatDock />, { preloadedState: state });
    open('alice');
    fireEvent.click(screen.getByRole('button', { name: 'ChatDock.minimise' }));
    expect(screen.queryByRole('region', { name: 'ChatDock.window' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ChatDock.open' }));
    expect(screen.getByRole('region', { name: 'ChatDock.window' })).toBeInTheDocument();
  });

  it('closes a window', () => {
    renderWithProviders(<ChatDock />, { preloadedState: state });
    open('alice');
    fireEvent.click(screen.getByRole('button', { name: 'ChatDock.close' }));
    expect(getChatDockState().chats).toEqual([]);
  });

  it('adds an incoming message as a bar, not a window', () => {
    const { store } = renderWithProviders(<ChatDock />, { preloadedState: state });
    receive(store, 'bob', 'hello');
    expect(getChatDockState().chats).toEqual([{ name: 'bob', expanded: false }]);
    expect(screen.getByRole('button', { name: 'ChatDock.open' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'ChatDock.window' })).not.toBeInTheDocument();
  });

  it('keeps an open window expanded when its peer writes', () => {
    const { store } = renderWithProviders(<ChatDock />, { preloadedState: state });
    open('alice');
    receive(store, 'alice', 'hi');
    expect(getChatDockState().chats).toEqual([{ name: 'alice', expanded: true }]);
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('sends from the window', () => {
    const { webClient } = renderWithProviders(<ChatDock />, { preloadedState: state }) as unknown as {
      webClient: { request: { session: { message: ReturnType<typeof vi.fn> } } };
    };
    open('alice');
    const input = screen.getByRole('textbox', { name: 'PrivateChat.input' });
    fireEvent.change(input, { target: { value: 'gg' } });
    fireEvent.submit(input.closest('form')!);
    expect(webClient.request.session.message).toHaveBeenCalledWith('alice', 'gg');
  });

  it('shows the profile card from the header and closes it with Escape', () => {
    renderWithProviders(<ChatDock />, { preloadedState: state });
    open('alice');
    const trigger = screen.getByRole('button', { name: 'ChatDock.showProfile' });
    fireEvent.click(trigger);
    const card = screen.getByRole('dialog', { name: 'ChatDock.profile.label' });
    expect(within(card).getByRole('button', { name: 'ChatDock.profile.removeBuddy' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'ChatDock.profile.openPage' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'ChatDock.profile.label' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('offers the shared user menu entries, such as Show games, under More', () => {
    renderWithProviders(<UserGamesProvider><ChatDock /></UserGamesProvider>, { preloadedState: state });
    open('alice');
    fireEvent.click(screen.getByRole('button', { name: 'ChatDock.showProfile' }));
    fireEvent.click(screen.getByRole('button', { name: 'ChatDock.profile.more' }));
    const menu = screen.getByRole('menu', { name: 'ChatDock.profile.moreLabel' });
    expect(within(menu).getByRole('menuitem', { name: 'UserGamesDialog.menu.showGames' })).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'ChatDock.profile.label' })).toBeInTheDocument();
  });

  it('collapses open windows when a game opens', () => {
    act(() => dispatchChatDock({ type: 'open', name: 'alice', max: 3 }));
    renderWithProviders(<ChatDock />, { preloadedState: state, route: '/game/7' });
    expect(getChatDockState().chats).toEqual([{ name: 'alice', expanded: false }]);
  });
});

describe('readBoardTrayHeight', () => {
  it('reads the tray height the board exposes, or zero', () => {
    const root = document.createElement('div');
    expect(readBoardTrayHeight(root)).toBe('0px');
    const board = document.createElement('div');
    board.style.setProperty('--board-tray-h', '172px');
    root.appendChild(board);
    expect(readBoardTrayHeight(root)).toBe('172px');
  });
});
