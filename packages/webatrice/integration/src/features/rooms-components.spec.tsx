import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';

import Messages from '../../../src/features/rooms/components/Messages';
import CreateGameDialog from '../../../src/features/rooms/dialogs/CreateGameDialog/CreateGameDialog';
import FilterGamesDialog from '../../../src/features/rooms/dialogs/FilterGamesDialog/FilterGamesDialog';
import { rooms } from '@cockatrice/datatrice';
import { ServerInfo_RoomSchema } from '@cockatrice/sockatrice/generated';

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

describe('Rooms components (integration)', () => {
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

    expect(screen.getByText('CreateGameDialog.title')).toBeInTheDocument();
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

    expect(screen.getByText('FilterGamesDialog.title')).toBeInTheDocument();
  });
});
