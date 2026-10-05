import { act, fireEvent, screen } from '@testing-library/react';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { games, type Game } from '@cockatrice/datatrice';
import {
  Event_GameJoinedSchema,
  Response_ResponseCode,
  ServerInfo_GameSchema,
  ServerInfo_RoomSchema,
  ServerInfo_UserSchema,
  ServerInfo_User_UserLevelFlag,
} from '@cockatrice/sockatrice/generated';

import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { renderWithProviders, connectedState, createMockWebClient, makeUser } from '../../__test-utils__';
import type { RootState } from '../../store';
import UserGamesDialog from './UserGamesDialog';
import { setAdminLocked } from '../../hooks/useAdminLock';

afterEach(() => setAdminLocked(false));

const mockWebClient = createMockWebClient();

vi.mock('@cockatrice/datatrice/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cockatrice/datatrice/react')>();
  return { ...actual, useWebClient: vi.fn(() => mockWebClient) };
});

const makeGame = (overrides: MessageInitShape<typeof ServerInfo_GameSchema> = {}): Game => ({
  info: create(ServerInfo_GameSchema, {
    gameId: 7,
    roomId: 2,
    description: 'Friday casual',
    playerCount: 1,
    maxPlayers: 2,
    spectatorsAllowed: true,
    creatorInfo: create(ServerInfo_UserSchema, { name: 'bob' }),
    ...overrides,
  }),
  gameType: 'Standard',
});

interface StateOptions {
  status?: RootState['server']['gamesOfUserStatus'][string];
  gameList?: Game[];
  joinedRoom?: boolean;
  judge?: boolean;
}

function stateWith({ status, gameList = [], joinedRoom = true, judge = false }: StateOptions = {}): Partial<RootState> {
  const server = connectedState.server as RootState['server'];
  const rooms = connectedState.rooms as RootState['rooms'];
  return {
    ...connectedState,
    server: {
      ...server,
      user: judge ? makeUser({ name: 'testUser', userLevel: ServerInfo_User_UserLevelFlag.IsJudge }) : server.user,
      gamesOfUser: { bob: Object.fromEntries(gameList.map((game) => [game.info.gameId, game])) },
      gamesOfUserStatus: status ? { bob: status } : {},
    },
    rooms: {
      ...rooms,
      rooms: { 2: { info: create(ServerInfo_RoomSchema, { roomId: 2, name: 'Constructed' }) } as never },
      joinedRoomIds: joinedRoom ? { 2: true } : {},
    },
  };
}

function renderDialog(options?: StateOptions) {
  const onClose = vi.fn();
  const utils = renderWithProviders(<UserGamesDialog userName="bob" onClose={onClose} />, {
    preloadedState: stateWith(options),
  });
  return { ...utils, onClose };
}

const loaded = { state: 'loaded' } as const;

describe('UserGamesDialog', () => {
  it('requests the games of the user when it opens', () => {
    renderDialog();
    expect(mockWebClient.request.session.getGamesOfUser).toHaveBeenCalledWith('bob');
    expect(screen.getByRole('dialog', { name: 'UserGamesDialog.title' })).toBeInTheDocument();
  });

  it('shows a loading state until the answer arrives', () => {
    renderDialog({ status: { state: 'loading' } });
    expect(screen.getByText('UserGamesDialog.loading')).toBeInTheDocument();
  });

  it.each([
    [Response_ResponseCode.RespNameNotFound, 'UserGamesDialog.error.userNotFound'],
    [Response_ResponseCode.RespInIgnoreList, 'UserGamesDialog.error.ignored'],
    [Response_ResponseCode.RespInternalError, 'UserGamesDialog.error.unknown'],
  ])('shows the desktop message for rejection %i', (code, key) => {
    renderDialog({ status: { state: 'failed', responseCode: code } });
    expect(screen.getByRole('alert')).toHaveTextContent(key);
  });

  it('gives the transport reason when the server never answered', () => {
    renderDialog({
      status: {
        state: 'failed',
        responseCode: Response_ResponseCode.RespNotConnected,
        failure: WebsocketTypes.CommandFailure.Disconnected,
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('CommandFailure.disconnected');
  });

  it('says so when the user is in no games', () => {
    renderDialog({ status: loaded });
    expect(screen.getByText('UserGamesDialog.empty')).toBeInTheDocument();
  });

  it('lists each game with its room, description, creator and type', () => {
    renderDialog({ status: loaded, gameList: [makeGame()] });
    const row = screen.getByText('Friday casual').closest('tr')!;
    expect(row).toHaveTextContent('Constructed');
    expect(row).toHaveTextContent('bob');
    expect(row).toHaveTextContent('Standard');
    expect(row).toHaveTextContent('1/2');
  });

  it('joins the selected game through its room', () => {
    renderDialog({ status: loaded, gameList: [makeGame()] });
    expect(screen.getByRole('button', { name: 'UserGamesDialog.action.join' })).toBeDisabled();

    fireEvent.click(screen.getByText('Friday casual'));
    fireEvent.click(screen.getByRole('button', { name: 'UserGamesDialog.action.join' }));
    expect(mockWebClient.request.rooms.joinGame).toHaveBeenCalledWith(2, expect.objectContaining({
      gameId: 7, spectator: false, joinAsJudge: false,
    }));
  });

  it('spectates on request, and only where spectators are allowed', () => {
    renderDialog({ status: loaded, gameList: [makeGame(), makeGame({ gameId: 8, description: 'Private', spectatorsAllowed: false })] });
    fireEvent.click(screen.getByText('Private'));
    expect(screen.getByRole('button', { name: 'UserGamesDialog.action.spectate' })).toBeDisabled();

    fireEvent.click(screen.getByText('Friday casual'));
    fireEvent.click(screen.getByRole('button', { name: 'UserGamesDialog.action.spectate' }));
    expect(mockWebClient.request.rooms.joinGame).toHaveBeenCalledWith(2, expect.objectContaining({ gameId: 7, spectator: true }));
  });

  it('offers judge joins to judges only', () => {
    renderDialog({ status: loaded, gameList: [makeGame()] });
    expect(screen.queryByRole('button', { name: 'UserGamesDialog.action.joinAsJudge' })).not.toBeInTheDocument();
  });

  it('lets a judge join as judge', () => {
    renderDialog({ status: loaded, gameList: [makeGame()], judge: true });
    fireEvent.click(screen.getByText('Friday casual'));
    fireEvent.click(screen.getByRole('button', { name: 'UserGamesDialog.action.joinAsJudge' }));
    expect(mockWebClient.request.rooms.joinGame).toHaveBeenCalledWith(2, expect.objectContaining({ joinAsJudge: true }));
  });

  describe('keyboard', () => {
    const twoGames = () => [makeGame(), makeGame({ gameId: 8, description: 'Late night' })];
    const rows = () => screen.getAllByRole('row').slice(1);

    it('makes the first row the grid\'s one Tab stop until a row is selected', () => {
      renderDialog({ status: loaded, gameList: twoGames() });
      expect(screen.getByRole('grid')).toBeInTheDocument();
      expect(rows().map((row) => row.tabIndex)).toEqual([0, -1]);
    });

    it('moves the selection and focus with the arrow keys', () => {
      renderDialog({ status: loaded, gameList: twoGames() });
      const [first, second] = rows();
      first.focus();
      fireEvent.keyDown(first, { key: 'ArrowDown' });
      expect(second).toHaveFocus();
      expect(second).toHaveAttribute('aria-selected', 'true');
      expect(rows().map((row) => row.tabIndex)).toEqual([-1, 0]);

      fireEvent.keyDown(second, { key: 'ArrowUp' });
      expect(first).toHaveFocus();
      expect(first).toHaveAttribute('aria-selected', 'true');
    });

    it('selects with Space so Join and Spectate can act on the row', () => {
      renderDialog({ status: loaded, gameList: twoGames() });
      fireEvent.keyDown(rows()[1], { key: ' ' });
      fireEvent.click(screen.getByRole('button', { name: 'UserGamesDialog.action.join' }));
      expect(mockWebClient.request.rooms.joinGame).toHaveBeenCalledWith(2, expect.objectContaining({ gameId: 8 }));
    });

    it('joins the row with Enter', () => {
      renderDialog({ status: loaded, gameList: twoGames() });
      fireEvent.keyDown(rows()[0], { key: 'Enter' });
      expect(mockWebClient.request.rooms.joinGame).toHaveBeenCalledWith(2, expect.objectContaining({
        gameId: 7, spectator: false,
      }));
    });
  });

  it('asks for the password of a protected game before joining', () => {
    renderDialog({ status: loaded, gameList: [makeGame({ withPassword: true })] });
    fireEvent.doubleClick(screen.getByText('Friday casual'));
    expect(mockWebClient.request.rooms.joinGame).not.toHaveBeenCalled();
    expect(screen.getByText('UserGamesDialog.password.title')).toBeInTheDocument();
  });

  it('asks the user to join the room first, as desktop does', () => {
    renderDialog({ status: loaded, gameList: [makeGame()], joinedRoom: false });
    fireEvent.doubleClick(screen.getByText('Friday casual'));
    expect(mockWebClient.request.rooms.joinGame).not.toHaveBeenCalled();
    expect(screen.getByText('UserGamesDialog.error.joinRoomFirst')).toBeInTheDocument();
  });

  it('closes once a join from its list is confirmed', () => {
    const { store, onClose } = renderDialog({ status: loaded, gameList: [makeGame()] });
    act(() => {
      store.dispatch(games.Actions.gameJoined({
        data: create(Event_GameJoinedSchema, { gameInfo: create(ServerInfo_GameSchema, { gameId: 7 }) }),
      }) as never);
    });
    expect(onClose).toHaveBeenCalled();
  });
});

it.each([
  ['ordinary', ServerInfo_User_UserLevelFlag.IsRegistered, false, false],
  ['locked ordinary', ServerInfo_User_UserLevelFlag.IsRegistered, true, false],
  ['moderator', ServerInfo_User_UserLevelFlag.IsModerator, false, true],
  ['locked moderator', ServerInfo_User_UserLevelFlag.IsModerator, true, false],
  ['judge', ServerInfo_User_UserLevelFlag.IsJudge, false, true],
  ['locked judge', ServerInfo_User_UserLevelFlag.IsJudge, true, true],
] as const)('gates private user games for %s', (_name, userLevel, locked, override) => {
  setAdminLocked(locked);
  const state = stateWith({ status: loaded, gameList: [makeGame({ playerCount: 2, spectatorsAllowed: false })] });
  state.server!.user = makeUser({ userLevel });
  renderWithProviders(<UserGamesDialog userName="bob" onClose={() => {}} />, { preloadedState: state });
  fireEvent.click(screen.getByText('Friday casual'));
  expect(screen.getByRole('button', { name: 'UserGamesDialog.action.join' })).toHaveProperty('disabled', !override);
  expect(screen.getByRole('button', { name: 'UserGamesDialog.action.spectate' })).toHaveProperty('disabled', !override);
});
