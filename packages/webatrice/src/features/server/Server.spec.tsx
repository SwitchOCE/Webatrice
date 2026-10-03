import { vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { create } from '@bufbuild/protobuf';

import { rooms } from '@cockatrice/datatrice';
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

beforeAll(() => {
  hoisted.mockWebClient = createMockWebClient();
});

describe('Server', () => {
  it('renders the rooms table and the user count panel', () => {
    const { container } = renderWithProviders(<Server />, {
      preloadedState: connectedWithRoomsState,
    });

    // Rooms table is inside RoomsList's <table>; scope to it so we don't
    // collide with any tab labels for the same room name in TopBar.
    const roomsTable = within(container.querySelector('table') as HTMLElement);
    expect(roomsTable.getByText('Name')).toBeInTheDocument();
    expect(roomsTable.getByText('Main Room')).toBeInTheDocument();
    // ServerUsers panel shows a "N connected" count instead of the old
    // "Users connected to server:" copy.
    expect(screen.getByText(/\d+ connected/)).toBeInTheDocument();
  });

  it('renders the sanitized server message html', () => {
    renderWithProviders(<Server />, {
      preloadedState: connectedState,
    });
    // Server MOTD is `<b>Welcome</b>` from the fixture, injected via
    // dangerouslySetInnerHTML on the new ServerMotd panel. The old
    // `.serverMessage__content` container class is gone, so assert on
    // the rendered <b> tag directly.
    const bold = screen.getByText('Welcome');
    expect(bold.tagName).toBe('B');
  });

  it('renders without rooms', () => {
    const { container } = renderWithProviders(<Server />, {
      preloadedState: connectedState,
    });
    // Empty-state row from RoomsList's <tbody> is the new "no rooms" signal;
    // the old `.server-rooms` container class no longer exists.
    expect(within(container).getByText(/No rooms available\./)).toBeInTheDocument();
  });

  describe('when a room join lands', () => {
    function renderLobby() {
      return renderWithProviders(
        <Routes>
          <Route path="/server" element={<Server />} />
          <Route path="/room/:roomId" element={<div>room-page</div>} />
        </Routes>,
        { preloadedState: connectedWithRoomsState, route: '/server' },
      );
    }
    const roomInfo = create(ServerInfo_RoomSchema, { roomId: 2, name: 'Side Room' });

    it('opens the room the user asked to join', () => {
      const { store } = renderLobby();
      act(() => {
        store.dispatch(rooms.Actions.joinRoom({ roomInfo, userInitiated: true }));
      });
      expect(screen.getByText('room-page')).toBeInTheDocument();
    });

    it('stays in the Lobby for a server auto-join, as desktop does (setCurrent = false)', () => {
      const { store } = renderLobby();
      act(() => {
        store.dispatch(rooms.Actions.joinRoom({ roomInfo, userInitiated: false }));
      });
      expect(screen.queryByText('room-page')).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    });
  });
});
