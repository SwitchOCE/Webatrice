import { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';

import { ServerInfo_GameSchema, ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import { rooms as roomsSlice, type Room } from '@cockatrice/datatrice';
import { VirtualRows } from '@app/components';

vi.mock('@app/components', async (original) => {
  const components = await original<typeof import('@app/components')>();
  return { ...components, VirtualRows: vi.fn(components.VirtualRows) };
});

import { connectedWithRoomsState, createMockWebClient, makeUser, renderWithProviders } from '../../../__test-utils__';
import type { RootState } from '../../../store';
import GamesList from './GamesList';

// react-window sizes its viewport via ResizeObserver, which the jsdom harness
// stubs to a no-op (zero height → zero rows). Install an emitting observer, as
// VirtualList.spec does, so rows actually mount.
type RoCallback = (entries: { contentRect: { height: number; width: number }; target: Element }[]) => void;
interface RoHandle { callback: RoCallback; targets: Set<Element> }
let observers: RoHandle[] = [];

function mountRows(container: HTMLElement): void {
  const list = container.querySelector('.virtual-list__list');
  if (!list) {
    throw new Error('virtual-list__list element not found');
  }
  for (const handle of observers) {
    if (handle.targets.has(list)) {
      act(() => {
        handle.callback([{ contentRect: { height: 400, width: 800 }, target: list }]);
      });
    }
  }
}

const makeGame = (gameId: number, description: string, playerCount = 1, spectatorsAllowed = true) => ({
  info: create(ServerInfo_GameSchema, {
    gameId, roomId: 1, description, playerCount, maxPlayers: 2, spectatorsAllowed, startTime: gameId,
  }),
  gameType: '',
});

const GAMES = { 1: makeGame(1, 'Alpha'), 2: makeGame(2, 'Bravo'), 3: makeGame(3, 'Charlie') };

interface SetupOptions {
  games?: Record<number, ReturnType<typeof makeGame>>;
  rooms?: Partial<RootState['rooms']>;
  userLevel?: number;
}

function setup({ games = GAMES, rooms: roomsOverrides = {}, userLevel }: SetupOptions = {}) {
  const rooms = connectedWithRoomsState.rooms!;
  const preloadedState: Partial<RootState> = {
    ...connectedWithRoomsState,
    rooms: { ...rooms, rooms: { 1: { ...rooms.rooms[1], games } }, ...roomsOverrides },
    ...(userLevel != null && {
      server: { ...connectedWithRoomsState.server!, user: makeUser({ name: 'me', userLevel }) },
    }),
  };
  const room = preloadedState.rooms!.rooms[1] as Room;
  const webClient = createMockWebClient();
  const view = renderWithProviders(<GamesList room={room} />, { preloadedState, webClient, route: '/room/1' });
  mountRows(view.container);
  return { ...view, webClient };
}

const row = (description: string) => screen.getByRole('row', { name: new RegExp(description) });

describe('GamesList', () => {
  let originalRo: typeof globalThis.ResizeObserver;

  beforeEach(() => {
    originalRo = globalThis.ResizeObserver;
    observers = [];
    globalThis.ResizeObserver = class {
      private handle: RoHandle;
      constructor(callback: RoCallback) {
        this.handle = { callback, targets: new Set() };
        observers.push(this.handle);
      }
      observe(target: Element) {
        this.handle.targets.add(target);
      }
      unobserve(target: Element) {
        this.handle.targets.delete(target);
      }
      disconnect() {
        this.handle.targets.clear();
      }
    } as unknown as typeof globalThis.ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalRo;
  });

  it('is a grid with one tab stop, on the first row until a game is selected', () => {
    setup();

    const grid = screen.getByRole('grid', { name: 'Games in Main Room' });
    const rows = within(grid).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    expect(rows.map((r) => r.getAttribute('aria-rowindex'))).toEqual(['2', '3', '4']);
    expect(grid).toHaveAttribute('aria-rowcount', '4');
  });

  it('moves the selection and focus with the arrow keys', () => {
    setup();
    // The default sort puts the newest game first.
    const [first, second] = screen.getAllByRole('row').slice(1);
    expect(first).toHaveAccessibleName(/Charlie/);

    fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveFocus();
    expect(screen.getByRole('button', { name: /^Join$/ })).toBeEnabled();
  });

  it('joins the focused game on Enter, without a prior click', () => {
    const { webClient } = setup();

    fireEvent.keyDown(row('Alpha'), { key: 'Enter' });

    expect(webClient.request.rooms.joinGame).toHaveBeenCalledWith(
      1, expect.objectContaining({ gameId: 1, spectator: false }), expect.any(String),
    );
  });

  it('joins on double-click like desktop', () => {
    const { webClient } = setup();

    fireEvent.doubleClick(row('Charlie'));

    expect(webClient.request.rooms.joinGame).toHaveBeenCalledWith(1, expect.objectContaining({ gameId: 3 }), expect.any(String));
  });

  it('does not redraw virtual rows when opening an unrelated toolbar dialog', () => {
    setup();
    const renderRow = vi.mocked(VirtualRows).mock.calls.at(-1)![0].renderRow;
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
    expect(vi.mocked(VirtualRows).mock.calls.at(-1)![0].renderRow).toBe(renderRow);
  });

  it('keeps keyboard focus on the same game when a newer game is inserted above it', () => {
    const { store, webClient } = setup();
    row('Bravo').focus();
    act(() => {
      store.dispatch(roomsSlice.Actions.updateGames({ roomId: 1, games: [makeGame(4, 'Delta').info] }));
    });
    expect(row('Bravo')).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(webClient.request.rooms.joinGame).toHaveBeenCalledWith(1, expect.objectContaining({ gameId: 2 }));
  });

  it('sorts from a header button and reports the sort direction', () => {
    setup();

    const description = screen.getByRole('button', { name: 'Description' });
    fireEvent.click(description);

    const header = screen.getByRole('columnheader', { name: /Description/ });
    expect(header).toHaveAttribute('aria-sort');
    // Restrictions has no sort field, so it gets no button.
    expect(screen.queryByRole('button', { name: 'Restrictions' })).not.toBeInTheDocument();
  });

  // Ported from the deleted GameSelector / GameSelectorToolbar specs: the
  // toolbar gating and dialogs they covered now live in GamesList. Password,
  // full-game spectate, already-open routing and join errors are useJoinGame's.
  describe('toolbar', () => {
    const join = () => screen.getByRole('button', { name: /^Join$/ });
    const spectate = () => screen.getByRole('button', { name: /^Spectate$/ });

    it('keeps Join disabled until a game is selected', () => {
      setup();

      expect(join()).toBeDisabled();
      fireEvent.click(row('Alpha'));
      expect(join()).toBeEnabled();
    });

    it('disables Join and Spectate while a join is pending', () => {
      setup({ rooms: { joinGamePending: true } });

      fireEvent.click(row('Alpha'));

      expect(join()).toBeDisabled();
      expect(spectate()).toBeDisabled();
    });

    it('disables Join when the selected game is full', () => {
      setup({ games: { 1: makeGame(1, 'Full', 2) } });

      fireEvent.click(row('Full'));

      expect(join()).toBeDisabled();
      expect(spectate()).toBeEnabled();
    });

    it('disables Spectate when the game allows no spectators', () => {
      setup({ games: { 1: makeGame(1, 'Closed', 1, false) } });

      fireEvent.click(row('Closed'));

      expect(spectate()).toBeDisabled();
      expect(join()).toBeEnabled();
    });

    it('shows the judge buttons only to a user with the IsJudge flag', () => {
      setup({ userLevel: ServerInfo_User_UserLevelFlag.IsUser });
      expect(screen.queryByRole('button', { name: /Judge/ })).not.toBeInTheDocument();
    });

    it('shows both judge buttons to a judge', () => {
      setup({ userLevel: ServerInfo_User_UserLevelFlag.IsUser | ServerInfo_User_UserLevelFlag.IsJudge });

      expect(screen.getByRole('button', { name: /^Judge$/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Judge · Spectate/ })).toBeInTheDocument();
    });

    it('applies the filter dialog to the room', () => {
      const { store } = setup();

      fireEvent.click(screen.getByRole('button', { name: /Filter games/ }));
      fireEvent.click(screen.getByLabelText(/Hide full games/i));
      fireEvent.click(screen.getByRole('button', { name: /Apply/ }));

      expect(store.getState().rooms.gameFilters[1]?.hideFullGames).toBe(true);
    });

    it('cancels the filter dialog without touching the filters', () => {
      const { store } = setup();

      fireEvent.click(screen.getByRole('button', { name: /Filter games/ }));
      fireEvent.click(screen.getByLabelText(/Hide full games/i));
      fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));

      expect(store.getState().rooms.gameFilters[1]).toBeUndefined();
    });

    it('dispatches clearGameFilters from Clear filter', () => {
      const { store } = setup({
        rooms: { gameFilters: { 1: { ...roomsSlice.DEFAULT_GAME_FILTERS, hideFullGames: true } } },
      });

      fireEvent.click(screen.getByRole('button', { name: /Clear filter/ }));

      expect(store.getState().rooms.gameFilters[1]).toEqual(roomsSlice.DEFAULT_GAME_FILTERS);
    });

    it('submits createGame from the create dialog', () => {
      const { webClient } = setup();

      fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
      const create = screen.getAllByRole('button', { name: /^Create$/ });
      fireEvent.click(create[create.length - 1]);

      expect(webClient.request.rooms.createGame).toHaveBeenCalledTimes(1);
      expect(vi.mocked(webClient.request.rooms.createGame).mock.calls[0][0]).toBe(1);
    });
  });
});
