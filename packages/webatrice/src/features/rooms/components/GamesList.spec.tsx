import { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';

import { ServerInfo_GameSchema } from '@cockatrice/sockatrice/generated';
import type { Room } from '@cockatrice/datatrice';

import { connectedWithRoomsState, createMockWebClient, renderWithProviders } from '../../../__test-utils__';
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

const makeGame = (gameId: number, description: string, playerCount = 1) => ({
  info: create(ServerInfo_GameSchema, {
    gameId, roomId: 1, description, playerCount, maxPlayers: 2, spectatorsAllowed: true, startTime: gameId,
  }),
  gameType: '',
});

const GAMES = { 1: makeGame(1, 'Alpha'), 2: makeGame(2, 'Bravo'), 3: makeGame(3, 'Charlie') };

function setup() {
  const rooms = connectedWithRoomsState.rooms!;
  const preloadedState: Partial<RootState> = {
    ...connectedWithRoomsState,
    rooms: { ...rooms, rooms: { 1: { ...rooms.rooms[1], games: GAMES } } },
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

  it('sorts from a header button and reports the sort direction', () => {
    setup();

    const description = screen.getByRole('button', { name: 'Description' });
    fireEvent.click(description);

    const header = screen.getByRole('columnheader', { name: /Description/ });
    expect(header).toHaveAttribute('aria-sort');
    // Restrictions has no sort field, so it gets no button.
    expect(screen.queryByRole('button', { name: 'Restrictions' })).not.toBeInTheDocument();
  });
});
