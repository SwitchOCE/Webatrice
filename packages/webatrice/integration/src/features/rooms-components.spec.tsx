import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';

import GamesList from '../../../src/features/rooms/components/GamesList';
import Messages from '../../../src/features/rooms/components/Messages';
import CreateGameDialog from '../../../src/features/rooms/dialogs/CreateGameDialog/CreateGameDialog';
import FilterGamesDialog from '../../../src/features/rooms/dialogs/FilterGamesDialog/FilterGamesDialog';
import { rooms } from '@cockatrice/datatrice';
import { ServerInfo_RoomSchema } from '@cockatrice/sockatrice/generated';
import type { Room as RoomType } from '@cockatrice/datatrice';

import { renderFeatureScreen, simulateLoggedIn, store } from './helpers';

beforeEach(() => {
  vi.useRealTimers();
  simulateLoggedIn();
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
});

const makeRoom = (): RoomType => ({
  info: { roomId: 1, name: 'Lobby' },
  gametypeMap: {},
  order: 0,
  games: {},
  users: {},
}) as unknown as RoomType;

describe('Rooms components (integration)', () => {
  it('mounts GamesList with an empty room as a games grid with sortable headers and a toolbar', () => {
    renderFeatureScreen(<GamesList room={makeRoom()} />);

    expect(screen.getByRole('grid', { name: 'Games in Lobby' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Age' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create/ })).toBeInTheDocument();
  });

  it('mounts Messages with rendered message data', () => {
    const { container } = renderFeatureScreen(
      <Messages messages={[{ message: 'hello', timeReceived: 1 } as never]} />,
    );

    expect(container.querySelectorAll('.message-wrapper')).toHaveLength(1);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('mounts CreateGameDialog open', () => {
    renderFeatureScreen(
      <CreateGameDialog
        isOpen
        gametypeMap={{}}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('Create Game')).toBeInTheDocument();
  });

  it('mounts FilterGamesDialog open with default filters', () => {
    renderFeatureScreen(
      <FilterGamesDialog
        isOpen
        initialFilters={rooms.DEFAULT_GAME_FILTERS}
        gametypeMap={{}}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('Filter games')).toBeInTheDocument();
  });
});
