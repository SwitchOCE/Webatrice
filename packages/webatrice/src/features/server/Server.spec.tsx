import { vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { create } from '@bufbuild/protobuf';

import { rooms } from '@cockatrice/datatrice';
import { makeGame, makeUser } from '@cockatrice/datatrice/testing';
import { ServerInfo_RoomSchema } from '@cockatrice/sockatrice/generated';

import {
  renderWithProviders,
  createMockWebClient,
  connectedState,
  connectedWithRoomsState,
} from '../../__test-utils__';

const hoisted = vi.hoisted(() => ({ mockWebClient: undefined as any }));

vi.mock('@cockatrice/datatrice/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cockatrice/datatrice/react')>();
  return { ...actual, useWebClient: () => hoisted.mockWebClient };
});

import Server from './Server';

beforeEach(() => {
  hoisted.mockWebClient = createMockWebClient();
});

const withBuddyGame = () => {
  const base = connectedWithRoomsState as any;
  const buddy = makeUser({ name: 'otherUser' });
  return {
    ...base,
    server: { ...base.server, buddyList: { otherUser: buddy } },
    rooms: {
      ...base.rooms,
      rooms: {
        1: {
          ...base.rooms.rooms[1],
          info: create(ServerInfo_RoomSchema, { roomId: 1, name: 'Main Room', autoJoin: true, gameCount: 1, playerCount: 2 }),
          games: {
            9: makeGame({
              gameId: 9, roomId: 1, description: 'Buddy game', playerCount: 1, maxPlayers: 2, spectatorsAllowed: true,
              creatorInfo: buddy,
            }),
          },
        },
      },
    },
  };
};

function renderHome(preloadedState: any) {
  return renderWithProviders(
    <Routes>
      <Route path="/server" element={<Server />} />
      <Route path="/room/:roomId" element={<div>room-page</div>} />
      <Route path="/player/:name" element={<div>player-page</div>} />
    </Routes>,
    { preloadedState, route: '/server' },
  );
}

describe('Server (Home)', () => {
  it('greets the user and lists the rooms with their counts', () => {
    renderHome(connectedWithRoomsState);
    expect(screen.getByRole('heading', { name: 'HomeHero.welcome' })).toBeInTheDocument();
    const roomsPanel = screen.getByRole('heading', { name: 'RoomsList.title' }).closest('section') as HTMLElement;
    expect(within(roomsPanel).getByText('Main Room')).toBeInTheDocument();
    expect(within(roomsPanel).getByText('RoomsList.joined')).toBeInTheDocument();
  });

  it('renders the sanitized server message html', () => {
    renderHome(connectedState);
    expect(screen.getByText('Welcome').tagName).toBe('B');
  });

  it('renders without rooms', () => {
    renderHome(connectedState);
    expect(screen.getByText('RoomsList.empty')).toBeInTheDocument();
    expect(screen.getByText('HomeHero.noRooms')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'HomeHero.play' })).not.toBeInTheDocument();
  });

  it('Play opens the usual room when it is joined', () => {
    renderHome(connectedWithRoomsState);
    fireEvent.click(screen.getByRole('button', { name: 'HomeHero.play' }));
    expect(screen.getByText('room-page')).toBeInTheDocument();
    expect(hoisted.mockWebClient.request.session.joinRoom).not.toHaveBeenCalled();
  });

  it('Play joins the usual room when it is not joined yet', () => {
    const base = connectedWithRoomsState as any;
    renderHome({ ...base, rooms: { ...base.rooms, joinedRoomIds: {} } });
    fireEvent.click(screen.getByRole('button', { name: 'HomeHero.play' }));
    expect(hoisted.mockWebClient.request.session.joinRoom).toHaveBeenCalledWith(1);
  });

  it('shows a game a buddy hosts and joins it through the room', () => {
    renderHome(withBuddyGame());
    const card = screen.getByRole('article', { name: 'Buddy game' });
    fireEvent.click(within(card).getByRole('button', { name: 'GameCard.joinLabel' }));
    expect(hoisted.mockWebClient.request.rooms.joinGame).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ gameId: 9, spectator: false }),
      expect.anything(),
    );
  });

  it('lists online buddies with what they host and a message action', () => {
    renderHome(withBuddyGame());
    const buddies = screen.getByRole('heading', { name: 'BuddiesOnline.title' }).closest('section') as HTMLElement;
    expect(within(buddies).getByText('BuddiesOnline.hosting')).toBeInTheDocument();
    fireEvent.click(within(buddies).getByRole('button', { name: 'BuddiesOnline.message' }));
    expect(screen.getByText('player-page')).toBeInTheDocument();
  });

  it('explains the empty buddy sections when there are no buddies', () => {
    renderHome(connectedWithRoomsState);
    expect(screen.getByText('BuddyGames.emptyNoBuddies')).toBeInTheDocument();
    expect(screen.getByText('BuddiesOnline.noBuddies')).toBeInTheDocument();
  });

  describe('when a room join lands', () => {
    const roomInfo = create(ServerInfo_RoomSchema, { roomId: 2, name: 'Side Room' });

    it('opens the room the user asked to join', () => {
      const { store } = renderHome(connectedWithRoomsState);
      act(() => {
        store.dispatch(rooms.Actions.joinRoom({ roomInfo, userInitiated: true }));
      });
      expect(screen.getByText('room-page')).toBeInTheDocument();
    });

    it('stays on Home for a server auto-join, as desktop does (setCurrent = false)', () => {
      const { store } = renderHome(connectedWithRoomsState);
      act(() => {
        store.dispatch(rooms.Actions.joinRoom({ roomInfo, userInitiated: false }));
      });
      expect(screen.queryByText('room-page')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'HomeHero.welcome' })).toBeInTheDocument();
    });
  });
});
