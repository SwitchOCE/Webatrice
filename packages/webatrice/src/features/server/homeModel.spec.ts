import { create } from '@bufbuild/protobuf';
import { makeGame, makeRoom, makeUser } from '@cockatrice/datatrice/testing';
import {
  ServerInfo_DeckStorage_FileSchema,
  ServerInfo_DeckStorage_FolderSchema,
  ServerInfo_DeckStorage_TreeItemSchema,
} from '@cockatrice/sockatrice/generated';
import type { RecentDeck } from '@app/services';

import {
  buddyHostedGames,
  countOpenSeatGames,
  liveRecentDecks,
  onlineBuddies,
  pickUsualRoom,
  sortRooms,
  totalGames,
} from './homeModel';

const host = (name: string) => makeUser({ name });

describe('sortRooms', () => {
  it('follows the server order', () => {
    const rooms = { 1: makeRoom({ roomId: 1, order: 2 }), 2: makeRoom({ roomId: 2, order: 1 }) };
    expect(sortRooms(rooms).map((r) => r.info.roomId)).toEqual([2, 1]);
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

describe('countOpenSeatGames and totalGames', () => {
  it('counts games with a free seat that have not started', () => {
    const room = makeRoom({
      gameCount: 3,
      games: {
        1: makeGame({ gameId: 1, playerCount: 1, maxPlayers: 2 }),
        2: makeGame({ gameId: 2, playerCount: 2, maxPlayers: 2 }),
        3: makeGame({ gameId: 3, playerCount: 1, maxPlayers: 4, started: true }),
      },
    });
    expect(countOpenSeatGames(room)).toBe(1);
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

  it('drops deleted decks and takes renamed names from the tree', () => {
    const root = create(ServerInfo_DeckStorage_FolderSchema, {
      items: [create(ServerInfo_DeckStorage_TreeItemSchema, {
        id: 1, name: 'Renamed', file: create(ServerInfo_DeckStorage_FileSchema, {}),
      })],
    });
    expect(liveRecentDecks([deck(1, 'One'), deck(2, 'Two')], root)).toEqual([deck(1, 'Renamed')]);
  });
});
