import type { MessageInitShape } from '@bufbuild/protobuf';
import type { Game, Room } from '@cockatrice/datatrice';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import type { ServerInfo_GameSchema, ServerInfo_User } from '@cockatrice/sockatrice/generated';
import { makeGame, makeRoom, makeUser } from '@cockatrice/datatrice/testing';
import { RECENT_DECKS_STORAGE_KEY, type RecentDeck } from '@app/services';

export const DASHBOARD_ENDPOINT = 'wss://server.example:4748';
export const DASHBOARD_SERVER_NAME = 'Gathering Grounds';
const ONLINE_COUNT = 105;
const MAGIC_ROOM_ID = 1;

const registered = ServerInfo_User_UserLevelFlag.IsUser | ServerInfo_User_UserLevelFlag.IsRegistered;
const person = (name: string, country: string, userLevel = registered) => makeUser({ name, country, userLevel });

const BUDDIES = [
  person('Wren_MTG', 'nz'),
  person('Saffi', 'se'),
  person('dekkerdraft', 'nl'),
  person('Korvold_Kid', 'us', ServerInfo_User_UserLevelFlag.IsUser),
];
const OFFLINE_BUDDIES = [person('pauperjosh', 'ca'), person('Mirelle', 'fr')];

const HOSTS = {
  kessig: person('Kessig_Wolf', 'de'),
  mainman: person('mainman879', 'us'),
  jsiggy: person('Jsiggy54', 'gb'),
  bobby: person('Bobby4261789', 'ca', ServerInfo_User_UserLevelFlag.IsUser),
  lena: person('Lena_V', 'pl'),
  golbog: person('GolbogDoomslay', 'au'),
  goyf: person('tarmogoyf_fan', 'br'),
  moxjet: person('moxjet', 'jp'),
};

const FORMATS = { Standard: 0, Modern: 1, Legacy: 2, Vintage: 3, Commander: 4, Pauper: 5, Pioneer: 6 } as const;
const gametypeMap = Object.fromEntries(Object.entries(FORMATS).map(([name, id]) => [id, name]));
type Format = keyof typeof FORMATS;

type GameSpec = MessageInitShape<typeof ServerInfo_GameSchema> & {
  gameId: number;
  host: ServerInfo_User;
  formats: Format[];
};

const game = ({ host, formats, ...info }: GameSpec): Game => makeGame({
  roomId: MAGIC_ROOM_ID,
  creatorInfo: host,
  gameTypes: formats.map((format) => FORMATS[format]),
  spectatorsAllowed: true,
  spectatorsCanChat: true,
  startTime: 1_792_000_000,
  ...info,
});

const MAGIC_GAMES: Game[] = [
  game({
    gameId: 101, host: HOSTS.kessig, formats: ['Commander'], description: 'cEDH pod, fast tables',
    maxPlayers: 4, playerCount: 3, spectatorsCount: 2,
  }),
  game({
    gameId: 102, host: HOSTS.mainman, formats: ['Legacy'], description: 'Legacy league practice',
    maxPlayers: 2, playerCount: 1,
  }),
  game({
    gameId: 103, host: HOSTS.jsiggy, formats: ['Modern'], description: 'Modern Bo3, no proxies',
    maxPlayers: 2, playerCount: 1, spectatorsCount: 1, shareDecklistsOnLoad: true,
  }),
  game({
    gameId: 104, host: HOSTS.bobby, formats: ['Commander'], description: 'Casual Commander, bracket 2',
    maxPlayers: 4, playerCount: 2,
  }),
  game({
    gameId: 105, host: HOSTS.lena, formats: ['Pauper'], description: 'Pauper gauntlet',
    maxPlayers: 2, playerCount: 2, started: true, spectatorsCount: 3, spectatorsOmniscient: true,
  }),
  game({
    gameId: 106, host: HOSTS.golbog, formats: ['Commander'], description: 'Precons only',
    maxPlayers: 4, playerCount: 1, withPassword: true,
  }),
  game({
    gameId: 107, host: HOSTS.goyf, formats: ['Modern', 'Pioneer'], description: 'Modern or Pioneer testing',
    maxPlayers: 2, playerCount: 1, onlyRegistered: true,
  }),
  game({
    gameId: 108, host: HOSTS.moxjet, formats: ['Legacy', 'Vintage'], description: 'Eternal weekend warm-up',
    maxPlayers: 2, playerCount: 2, spectatorsCount: 5,
  }),
  game({
    gameId: 201, host: BUDDIES[0], formats: ['Commander'], description: 'Commander night with Wren',
    maxPlayers: 4, playerCount: 2, spectatorsCount: 1,
  }),
  game({
    gameId: 202, host: BUDDIES[1], formats: ['Legacy'], description: 'Legacy, Saffi hosting',
    maxPlayers: 2, playerCount: 1,
  }),
  game({
    gameId: 203, host: BUDDIES[2], formats: ['Modern'], description: 'Modern Bo3 grind',
    maxPlayers: 2, playerCount: 2, started: true, spectatorsCount: 4,
  }),
];

const FILLER = ['Ashnod', 'brineborn', 'CardboardCrack', 'Delver42', 'emrakul_fan', 'Fblthp', 'GrixisGuy', 'hallowfox',
  'IzzetEngineer', 'Jund_em_out', 'kraum_ludevic', 'LotusField', 'Mox_Opal', 'Niv2Light', 'OkoThief', 'pillowfort',
  'quietspeculation', 'RakdosRiot', 'SimicSkies', 'thoughtseize', 'urza_tron', 'valakut', 'wurmcoil', 'Xenagos', 'YawgmothB',
  'zurgo_bellstriker'];
const COUNTRIES = ['us', 'de', 'gb', 'fr', 'it', 'es', 'br', 'ca', 'au', 'jp', 'pl', 'se', 'nl', 'mx', 'ar', 'cz'];

export interface DashboardSeed {
  users: Record<string, ServerInfo_User>;
  buddyList: Record<string, ServerInfo_User>;
  rooms: Record<number, Room>;
  message: string;
}

export function buildDashboard(present: readonly ServerInfo_User[]): DashboardSeed {
  const users: Record<string, ServerInfo_User> = {};
  for (const user of [...present, ...BUDDIES, ...Object.values(HOSTS)]) {
    users[user.name] = user;
  }
  for (let i = 0; Object.keys(users).length < ONLINE_COUNT; i++) {
    const name = i < FILLER.length ? FILLER[i] : `${FILLER[i % FILLER.length]}${Math.floor(i / FILLER.length) + 1}`;
    const level = i % 4 === 0 ? ServerInfo_User_UserLevelFlag.IsUser : registered;
    users[name] = person(name, COUNTRIES[i % COUNTRIES.length], level);
  }
  const everyone = Object.values(users);
  const roomUsers = (count: number, offset: number) =>
    Object.fromEntries(everyone.slice(offset, offset + count).map((user) => [user.name, user]));

  const rooms: Record<number, Room> = {
    1: makeRoom({
      roomId: MAGIC_ROOM_ID, name: 'Magic', description: 'Play any format, any time', autoJoin: true,
      gameCount: 58, playerCount: 87, gametypeMap, order: 0,
      games: Object.fromEntries(MAGIC_GAMES.map((g) => [g.info.gameId, g])),
      users: roomUsers(87, 0),
    }),
    2: makeRoom({
      roomId: 2, name: 'Commander', description: 'Multiplayer EDH pods', gameCount: 23, playerCount: 41, gametypeMap, order: 1,
    }),
    3: makeRoom({
      roomId: 3, name: 'Tournaments', description: 'Organised events and leagues', gameCount: 4, playerCount: 12, gametypeMap,
      order: 2, permissionlevel: 'registered',
    }),
    4: makeRoom({
      roomId: 4, name: 'Español', description: 'Partidas en español', gameCount: 2, playerCount: 9, gametypeMap, order: 3,
    }),
  };

  return {
    users,
    buddyList: Object.fromEntries([...BUDDIES, ...OFFLINE_BUDDIES].map((user) => [user.name, user])),
    rooms,
    message: ANNOUNCEMENT,
  };
}

const ANNOUNCEMENT = [
  '<p><b>Welcome to Gathering Grounds!</b> Be kind, play fair, and have fun.</p>',
  '<p><b>Maintenance:</b> the server restarts every Monday at 06:00 UTC for about ten minutes. '
  + 'Games in progress are lost, so please finish up beforehand.</p>',
  '<p><b>New this month</b></p>',
  '<ul><li>Card data now includes the latest set and its Commander precons.</li>'
  + '<li>The Tournaments room is open to registered users. Sign-ups for the Saturday Legacy league close Friday night.</li>'
  + '<li>Replays are kept for 30 days. Download the ones you want to keep.</li></ul>',
  '<p><b>House rules</b></p>',
  '<ul><li>Use the game description to say what you expect: power level, proxies, bracket, best-of-three.</li>'
  + '<li>Concede in chat before you leave a game.</li>'
  + '<li>No harassment, slurs or spam. Moderators may warn, mute or ban without notice.</li>'
  + '<li>Report problems with the in-game report button so a moderator sees the context.</li></ul>',
  '<p>Need help? Read the <a href="https://example.com/faq" target="_blank" rel="noreferrer">FAQ</a> or ask in the Magic room. '
  + 'Moderators are online most evenings (UTC).</p>',
  '<p>Want to support the server? Hosting costs are covered by donations from players like you. '
  + 'Thank you to everyone who chipped in last month.</p>',
  '<p><b>Known issues:</b> spectators sometimes miss the first turn of a game they join late. '
  + 'Rejoining fixes it. A fix is on the way.</p>',
].join('');

const deck = (deckId: number, hoursAgo: number, rest: Omit<RecentDeck, 'scope' | 'owner' | 'deckId' | 'openedAt'>) =>
  (owner: string, now: number): RecentDeck => ({
    scope: DASHBOARD_ENDPOINT, owner, deckId, openedAt: now - hoursAgo * 3_600_000, ...rest,
  });

const RECENT_DECKS = [
  deck(11, 1, {
    name: 'Kenrith Group Hug', format: 'commander', colors: 'WUBRG', cardCount: 99, bracketLevel: 3,
    commanderName: 'Kenrith, the Returned King',
  }),
  deck(12, 5, { name: 'Mono-Red Prowess', format: 'modern', colors: 'R', cardCount: 60, bannerCard: 'Monastery Swiftspear' }),
  deck(13, 26, { name: 'Delver of Secrets', format: 'legacy', colors: 'UR', cardCount: 60, bannerCard: 'Delver of Secrets' }),
  deck(14, 50, {
    name: 'Atraxa Superfriends', format: 'commander', colors: 'WUBG', cardCount: 99, bracketLevel: 4,
    commanderName: 'Atraxa, Praetors\' Voice',
  }),
  deck(15, 72, { name: 'Amulet Titan', format: 'modern', colors: 'G', cardCount: 60, bannerCard: 'Primeval Titan' }),
  deck(16, 120, { name: 'Faeries', format: 'pauper', colors: 'UB', cardCount: 60, bannerCard: 'Spellstutter Sprite' }),
  deck(17, 200, {
    name: 'Ur-Dragon Tribal', format: 'commander', colors: 'WUBRG', cardCount: 99, bracketLevel: 2, commanderName: 'The Ur-Dragon',
  }),
];

export function seedRecentDecks(owner: string): void {
  const now = Date.now();
  window.localStorage.setItem(RECENT_DECKS_STORAGE_KEY, JSON.stringify(RECENT_DECKS.map((build) => build(owner, now))));
}
