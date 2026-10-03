import { vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { Room } from '@cockatrice/datatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { renderWithProviders, createMockWebClient, connectedState } from '../../__test-utils__';

const hoisted = vi.hoisted(() => ({ mockWebClient: undefined as any }));

vi.mock('@cockatrice/datatrice/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cockatrice/datatrice/react')>();
  return { ...actual, useWebClient: () => hoisted.mockWebClient };
});

import RoomsList from './RoomsList';

beforeAll(() => {
  hoisted.mockWebClient = createMockWebClient();
});

const makeRoom = (overrides: Partial<Room['info']> = {}): Room =>
  ({
    info: {
      roomId: 1,
      name: 'Main Room',
      description: 'The lobby',
      permissionlevel: 'none',
      playerCount: 3,
      gameCount: 2,
      ...overrides,
    },
  }) as unknown as Room;

describe('RoomsList', () => {
  it('renders the table headers', () => {
    renderWithProviders(<RoomsList rooms={{}} joinedRooms={[]} />, {
      preloadedState: connectedState,
    });
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
    expect(screen.getByText('Players')).toBeInTheDocument();
    expect(screen.getByText('Games')).toBeInTheDocument();
  });

  it('renders a row per room', () => {
    const rooms = { 1: makeRoom(), 2: makeRoom({ roomId: 2, name: 'Second Room' }) };
    renderWithProviders(<RoomsList rooms={rooms} joinedRooms={[]} />, {
      preloadedState: connectedState,
    });
    expect(screen.getByText('Main Room')).toBeInTheDocument();
    expect(screen.getByText('Second Room')).toBeInTheDocument();
  });

  it('joins a room via the web client when not already joined', () => {
    const rooms = { 1: makeRoom() };
    renderWithProviders(<RoomsList rooms={rooms} joinedRooms={[]} />, {
      preloadedState: connectedState,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(hoisted.mockWebClient.request.session.joinRoom).toHaveBeenCalledWith(1);
  });

  it('navigates instead of re-joining when the room is already joined', () => {
    const room = makeRoom();
    const rooms = { 1: room };
    renderWithProviders(<RoomsList rooms={rooms} joinedRooms={[room]} />, {
      preloadedState: connectedState,
    });

    // Joined rooms now render an "Open" button (navigate) instead of the
    // "Join" button (webClient.joinRoom); assert it does not call the
    // join request.
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(hoisted.mockWebClient.request.session.joinRoom).not.toHaveBeenCalled();
  });

  it.each([
    ['the permission level when it is set', { permissionlevel: 'REGISTERED', privilegelevel: 'VIP' }, 'registered'],
    ['the privilege level when the permission level is none', { permissionlevel: 'none', privilegelevel: 'VIP' }, 'vip'],
    ['none when neither level is set', { permissionlevel: 'none', privilegelevel: '' }, 'none'],
  ])('shows %s in the Permissions column', (_label, levels, expected) => {
    renderWithProviders(<RoomsList rooms={{ 1: makeRoom(levels) }} joinedRooms={[]} />, {
      preloadedState: connectedState,
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  describe('join failures', () => {
    const withJoinError = (code: number, failure?: WebsocketTypes.CommandFailure) => ({
      ...connectedState,
      rooms: { ...(connectedState.rooms as any), joinRoomError: { roomId: 1, responseCode: code, failure } },
    });

    it.each([
      [6, 'RoomsList.joinError.notFound'],
      [11, 'RoomsList.joinError.contextError'],
      [15, 'RoomsList.joinError.userLevelTooLow'],
      [3, 'RoomsList.joinError.unknown'],
    ])('maps response code %i to the desktop message', (code, key) => {
      renderWithProviders(<RoomsList rooms={{ 1: makeRoom() }} joinedRooms={[]} />, {
        preloadedState: withJoinError(code),
      });
      expect(screen.getByRole('dialog')).toHaveTextContent(key);
    });

    it('explains a join the server never answered with the transport reason', () => {
      renderWithProviders(<RoomsList rooms={{ 1: makeRoom() }} joinedRooms={[]} />, {
        preloadedState: withJoinError(-1, WebsocketTypes.CommandFailure.Disconnected),
      });
      expect(screen.getByRole('dialog')).toHaveTextContent('CommandFailure.disconnected');
    });

    it('clears the error on dismiss so the join can be retried', () => {
      const { store } = renderWithProviders(<RoomsList rooms={{ 1: makeRoom() }} joinedRooms={[]} />, {
        preloadedState: withJoinError(6),
      });
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
      expect(store.getState().rooms.joinRoomError).toBeNull();
    });
  });
});
