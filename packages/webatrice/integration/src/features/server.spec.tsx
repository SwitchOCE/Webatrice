import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';

import { Server } from '@app/features/server';
import { rooms } from '@cockatrice/datatrice';
import {
  Command_JoinRoom_ext,
  Event_ListRoomsSchema,
  Event_ListRooms_ext,
  Response_ResponseCode,
  ServerInfo_RoomSchema,
} from '@cockatrice/sockatrice/generated';

import { connectAndHandshake } from '../helpers/setup';
import { buildResponse, buildResponseMessage, buildSessionEventMessage, deliverMessage } from '../helpers/protobuf-builders';
import { findLastSessionCommand } from '../helpers/command-capture';
import { renderFeatureScreen, simulateLoggedIn, store } from './helpers';

beforeEach(() => {
  vi.useRealTimers();
  simulateLoggedIn();
});

describe('Server (integration)', () => {
  it('renders the rooms shell with the empty user count', () => {
    const { container } = renderFeatureScreen(<Server />);

    // Old `.server-rooms` container is gone; the rooms shell is now a
    // <table> inside RoomsList. ServerUsers panel exposes user count as
    // "N connected" instead of "Users connected to server:".
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(screen.getByText('ServerUsers.count')).toBeInTheDocument();
  });

  it('shows a row in the rooms table for each known room', () => {
    store.dispatch(rooms.Actions.joinRoom({
      roomInfo: create(ServerInfo_RoomSchema, {
        roomId: 1,
        name: 'Lobby',
        description: 'Test lobby',
        autoJoin: false,
        gameList: [],
        userList: [],
        gametypeList: [],
      }),
    }));

    const { container } = renderFeatureScreen(<Server />);

    // `.rooms` class no longer exists — RoomsList renders a <table> and
    // a <tr> per room; scope to the <tbody> to skip the header cells.
    const tbody = container.querySelector('table tbody');
    expect(tbody?.textContent).toContain('Lobby');
  });

  it('explains a rejected room join and keeps the user in the lobby', async () => {
    connectAndHandshake();
    simulateLoggedIn();
    deliverMessage(buildSessionEventMessage(Event_ListRooms_ext, create(Event_ListRoomsSchema, {
      roomList: [create(ServerInfo_RoomSchema, { roomId: 4, name: 'Gated', permissionlevel: 'none' })],
    })));

    renderFeatureScreen(<Server />);
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.join' }));

    const join = findLastSessionCommand(Command_JoinRoom_ext);
    expect(join.value.roomId).toBe(4);
    deliverMessage(buildResponseMessage(buildResponse({
      cmdId: join.cmdId,
      responseCode: Response_ResponseCode.RespNameNotFound,
    })));

    expect(store.getState().rooms.joinRoomError)
      .toEqual({ roomId: 4, responseCode: Response_ResponseCode.RespNameNotFound, failure: undefined });
    expect(await screen.findByRole('dialog')).toHaveTextContent('RoomsList.joinError.notFound');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(store.getState().rooms.joinRoomError).toBeNull();
    expect(await screen.findByRole('button', { name: 'Common.action.join' })).toBeInTheDocument();
  });
});
