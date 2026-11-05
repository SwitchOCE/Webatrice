import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { createStore, rooms as roomsStore } from '@cockatrice/datatrice';
import { makeGame, makeRoom, makeUser } from '@cockatrice/datatrice/testing';
import {
  ServerInfo_DeckStorage_FileSchema,
  ServerInfo_DeckStorage_FolderSchema,
  ServerInfo_DeckStorage_TreeItemSchema,
  ServerInfo_RoomSchema,
} from '@cockatrice/sockatrice/generated';
import type { RecentDeck } from '@app/services';

import {
  buddyGamesEmptyKind,
  buddyHostedGames,
  joinableOpenGames,
  liveRecentDecks,
  onlineBuddies,
  pickUsualRoom,
  serverDeckCount,
  sortRooms,
  totalGames,
} from './homeModel';

const host = (name: string) => makeUser({ name });

describe('sortRooms', () => {
  it('follows the server order', () => {
    const rooms = { 1: makeRoom({ roomId: 1, order: 2 }), 2: makeRoom({ roomId: 2, order: 1 }) };
    expect(sortRooms(rooms).map((r) => r.info.roomId)).toEqual([2, 1]);
  });

  it('keeps server order after a sparse update of room 3 and joining room 2', () => {
    const store = createStore();
    const rooms = [1, 2, 3].map((roomId) => makeRoom({ roomId }).info);
    store.dispatch(roomsStore.Actions.updateRooms({ rooms }));
    const sortedIds = () => sortRooms(store.getState().rooms.rooms).map((room) => room.info.roomId);
    expect(sortedIds()).toEqual([1, 2, 3]);

    const sparse = fromBinary(ServerInfo_RoomSchema, toBinary(ServerInfo_RoomSchema, create(ServerInfo_RoomSchema, {
      roomId: 3, playerCount: 42, gameCount: 2,
    })));
    store.dispatch(roomsStore.Actions.updateRooms({ rooms: [sparse] }));
    expect.soft(sortedIds()).toEqual([1, 2, 3]);

    store.dispatch(roomsStore.Actions.joinRoom({ roomInfo: rooms[1] }));
    expect(sortedIds()).toEqual([1, 2, 3]);
    expect(store.getState().rooms.joinedRoomIds[2]).toBe(true);
  });
});

describe('pickUsualRoom', () => {
  const main = makeRoom({ roomId: 1, name: 'Main', autoJoin: true });
  const side = makeRoom({ roomId: 2, name: 'Side' });
  const rooms = [main, side];

  it('prefers the startup room setting', () => {
    expect(pickUsualRoom(rooms, { 1: true }, 'Side')).toBe(side);
  });

  it('falls back to the joined auto-join room, then any joined room, then the auto-join room', () => {
    expect(pickUsualRoom(rooms, { 1: true, 2: true }, '')).toBe(main);
    expect(pickUsualRoom([side, makeRoom({ roomId: 3 })], { 3: true }, 'Gone').info.roomId).toBe(3);
    expect(pickUsualRoom(rooms, {}, '')).toBe(main);
    expect(pickUsualRoom([], {}, '')).toBeUndefined();
  });
});

describe('totalGames', () => {
  it('sums the game counts across rooms', () => {
    const room = makeRoom({ gameCount: 3 });
    expect(totalGames([room, makeRoom({ gameCount: 4 })])).toBe(7);
  });
});

describe('buddyHostedGames', () => {
  it('keeps games a buddy created, open seats first, then waiting, then started', () => {
    const room = makeRoom({
      games: {
        1: makeGame({ gameId: 1, playerCount: 1, maxPlayers: 2, started: true, creatorInfo: host('bud') }),
        2: makeGame({ gameId: 2, playerCount: 2, maxPlayers: 2, creatorInfo: host('bud') }),
        3: makeGame({ gameId: 3, playerCount: 1, maxPlayers: 2, creatorInfo: host('bud') }),
        4: makeGame({ gameId: 4, playerCount: 1, maxPlayers: 2, creatorInfo: host('stranger') }),
      },
    });
    expect(buddyHostedGames([room], new Set(['bud'])).map((g) => g.game.info.gameId)).toEqual([3, 2, 1]);
  });
});

describe('onlineBuddies', () => {
  it('lists online buddies by name with the game they host', () => {
    const game = makeGame({ gameId: 5, creatorInfo: host('bea') });
    const hosted = [{ room: makeRoom(), game }];
    const buddies = { cid: host('cid'), bea: host('bea'), off: host('off') };
    const online = { bea: host('bea'), cid: host('cid'), other: host('other') };
    const result = onlineBuddies(buddies, online, hosted);
    expect(result.map((b) => b.user.name)).toEqual(['bea', 'cid']);
    expect(result[0].hosting).toBe(game);
    expect(result[1].hosting).toBeUndefined();
  });
});

describe('liveRecentDecks', () => {
  const deck = (deckId: number, name: string): RecentDeck => ({
    scope: 'localhost:4748', owner: 'a', deckId, name, format: '', colors: '', cardCount: 0, openedAt: 0,
  });

  it('keeps the stored list until the deck tree is loaded', () => {
    expect(liveRecentDecks([deck(1, 'One')], undefined)).toEqual([deck(1, 'One')]);
  });

  it('carries creation time from nested live files without using the last-opened time', () => {
    const root = create(ServerInfo_DeckStorage_FolderSchema, { items: [{
      name: 'Folder', folder: { items: [{ id: 1, name: 'One', file: { creationTime: 123 } }] },
    }] });
    expect(liveRecentDecks([deck(1, 'One')], root)[0]).toMatchObject({ creationTime: 123, openedAt: 0 });
  });

  it('drops deleted decks and takes renamed names from the tree', () => {
    const root = create(ServerInfo_DeckStorage_FolderSchema, {
      items: [create(ServerInfo_DeckStorage_TreeItemSchema, {
        id: 1, name: 'Renamed', file: create(ServerInfo_DeckStorage_FileSchema, {}),
      })],
    });
    expect(liveRecentDecks([deck(1, 'One'), deck(2, 'Two')], root)).toEqual([deck(1, 'Renamed')]);
  });
});

describe('buddyGamesEmptyKind', () => {
  it('asks for buddies first, then a joined room', () => {
    expect(buddyGamesEmptyKind(0, 2)).toBe('noBuddies');
    expect(buddyGamesEmptyKind(3, 0)).toBe('notJoined');
    expect(buddyGamesEmptyKind(3, 1)).toBe('noneHosting');
  });
});

describe('joinableOpenGames', () => {
  const game = (gameId: number, extra: Record<string, unknown> = {}) =>
    makeGame({ gameId, playerCount: 1, maxPlayers: 2, ...extra });

  it('keeps games a stranger can join and orders them closest to starting, newest first', () => {
    const games = [
      game(1, { maxPlayers: 4 }),
      game(2),
      game(3),
      game(4, { withPassword: true }),
      game(5, { onlyBuddies: true }),
      game(6, { started: true }),
      game(7, { playerCount: 2 }),
    ];
    const ids = joinableOpenGames(games, { exclude: new Set(), isRegistered: true, limit: 10 }).map((g) => g.info.gameId);
    expect(ids).toEqual([3, 2, 1]);
  });

  it('drops registered-only games for guests, excluded games, and caps the list', () => {
    const games = [game(1, { onlyRegistered: true }), game(2), game(3), game(4)];
    const guest = joinableOpenGames(games, { exclude: new Set([4]), isRegistered: false, limit: 1 });
    expect(guest.map((g) => g.info.gameId)).toEqual([3]);
    expect(joinableOpenGames(games, { exclude: new Set(), isRegistered: true, limit: 10 })).toHaveLength(4);
  });
});

describe('serverDeckCount', () => {
  it('counts decks in nested folders and is zero before the tree loads', () => {
    const file = (id: number) => create(ServerInfo_DeckStorage_TreeItemSchema, {
      id, name: `d${id}`, file: create(ServerInfo_DeckStorage_FileSchema, {}),
    });
    const root = create(ServerInfo_DeckStorage_FolderSchema, {
      items: [file(1), create(ServerInfo_DeckStorage_TreeItemSchema, {
        id: 9, name: 'folder', folder: create(ServerInfo_DeckStorage_FolderSchema, { items: [file(2), file(3)] }),
      })],
    });
    expect(serverDeckCount(root)).toBe(3);
    expect(serverDeckCount(undefined)).toBe(0);
  });
});
