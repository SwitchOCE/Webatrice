// Design preview only. Builds a started game in the exact shape Servatrice's
// full-state sync produces, so the real board renders without a server.
// Battlefield x follows Server_CardZone::getFreeGridColumn: same-name cards pile
// up to three deep in one column (x = col * 3 + subPos), new names take the
// lowest free column. y follows TableZone: 0 creatures, 1 other permanents, 2 lands.
import { create } from '@bufbuild/protobuf';
import { ServerInfo_CardCounterSchema, ServerInfo_ArrowSchema, colorSchema } from '@cockatrice/sockatrice/generated';
import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import { ZoneName } from '@cockatrice/sockatrice';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { GameSortField, SortDirection, UserSortField } from '@cockatrice/datatrice';
import type { GameEntry, PlayerEntry } from '@cockatrice/datatrice';
import {
  makeCard,
  makeCounter,
  makeGameEntry,
  makeGameInfo,
  makePlayerEntry,
  makePlayerProperties,
  makeUser,
  makeZoneEntry,
} from '@cockatrice/datatrice/testing';

type Row = 0 | 1 | 2;
interface Perm { name: string; row: Row; tapped?: boolean; pt?: string; counters?: number; copies?: number; attacking?: boolean }
interface SeatSpec {
  id: number;
  user: string;
  life: number;
  commander?: { name: string; tax: number; inPlay: boolean };
  perms: Perm[];
  hand?: string[];
  handCount: number;
  deck: number;
  grave: string[];
  exile: string[];
  stack?: string[];
  cmdTaken?: Record<number, number>;
}

const creature = (name: string, pt: string, o: Partial<Perm> = {}): Perm => ({ name, row: 0, pt, ...o });
const other = (name: string, o: Partial<Perm> = {}): Perm => ({ name, row: 1, ...o });
const land = (name: string, copies: number, tapped = 0): Perm[] =>
  Array.from({ length: copies }, (_, i) => ({ name, row: 2 as Row, tapped: i < tapped }));

const EDH: SeatSpec[] = [
  {
    id: 1, user: 'Alex', life: 38, handCount: 8, deck: 66,
    commander: { name: 'Kenrith, the Returned King', tax: 0, inPlay: false },
    perms: [
      ...land('Forest', 4, 2), ...land('Mountain', 3, 1), ...land('Plains', 1), ...land('Island', 1), ...land('Swamp', 1),
      ...land('Command Tower', 1, 1), ...land('Exotic Orchard', 1),
      other('Sol Ring', { tapped: true }), other('Arcane Signet'), other('Rhystic Study'), other('Smothering Tithe'),
      creature('Llanowar Elves', '1/1', { tapped: true }), creature('Birds of Paradise', '0/1'),
      creature('Dockside Extortionist', '1/2'), creature('Eternal Witness', '2/1'),
      creature('Soldier', '1/1', { copies: 3 }),
    ],
    hand: ['Cultivate', 'Swords to Plowshares', 'Beast Within', 'Craterhoof Behemoth', 'Heroic Intervention',
      'Teferi\'s Protection', 'Farseek', 'Lightning Greaves'],
    grave: ['Ponder', 'Brainstorm', 'Rampant Growth', 'Nature\'s Lore', 'Counterspell', 'Explore', 'Growth Spiral', 'Three Visits', 'Harmonize'],
    exile: ['Snapcaster Mage', 'Mana Drain'],
    cmdTaken: { 2: 0, 3: 5, 4: 14 },
  },
  {
    id: 2, user: 'Kess', life: 40, handCount: 5, deck: 58,
    commander: { name: 'Kess, Dissident Mage', tax: 2, inPlay: false },
    perms: [
      ...land('Island', 5, 2), ...land('Swamp', 3, 1), ...land('Mountain', 2), ...land('Command Tower', 1), ...land('Steam Vents', 1, 1),
      other('Mystic Remora', { counters: 2 }), other('Talisman of Dominance', { tapped: true }), other('Underworld Breach'),
      creature('Snapcaster Mage', '2/1'), creature('Baral, Chief of Compliance', '1/3'), creature('Dark Confidant', '2/1', { tapped: true }),
    ],
    grave: ['Lightning Bolt', 'Ponder', 'Preordain', 'Dark Ritual', 'Fact or Fiction', 'Counterspell', 'Opt', 'Thoughtseize', 'Faithless Looting', 'Gitaxian Probe', 'Duress', 'Mana Leak', 'Frantic Search', 'Cyclonic Rift'],
    exile: ['Force of Will', 'Misdirection', 'Daze'],
    stack: ['Brainstorm'],
    cmdTaken: { 1: 6, 3: 3 },
  },
  {
    id: 3, user: 'Tomo', life: 12, handCount: 2, deck: 61,
    commander: { name: 'The Ur-Dragon', tax: 4, inPlay: false },
    perms: [
      ...land('Forest', 5, 5), ...land('Mountain', 2, 2), ...land('Cavern of Souls', 1, 1), ...land('Haven of the Spirit Dragon', 1),
      ...land('Path of Ancestry', 1, 1),
      other('Dragon\'s Hoard', { tapped: true }), other('Herald\'s Horn'),
      creature('Scion of the Ur-Dragon', '4/4'), creature('Old Gnawbone', '7/7', { tapped: true, attacking: true }),
      creature('Dragon', '5/5', { copies: 2 }),
    ],
    grave: ['Cultivate', 'Kodama\'s Reach', 'Crux of Fate'],
    exile: [],
    cmdTaken: { 2: 0 },
  },
  {
    id: 4, user: 'Ravi', life: 34, handCount: 4, deck: 55,
    commander: { name: 'Atraxa, Praetors\' Voice', tax: 2, inPlay: true },
    perms: [
      ...land('Forest', 6, 4), ...land('Island', 3, 3), ...land('Swamp', 4, 2), ...land('Plains', 1), ...land('Command Tower', 1, 1),
      ...land('Breeding Pool', 1, 1), { name: 'Dark Depths', row: 2, counters: 9 },
      other('Doubling Season'), other('Contagion Engine'), other('Vraska, Golgari Queen', { counters: 6 }),
      creature('Atraxa, Praetors\' Voice', '4/4', { tapped: true, attacking: true }), creature('Evolution Sage', '3/2'),
      creature('Fathom Mage', '1/1', { counters: 3 }),
    ],
    grave: ['Swords to Plowshares', 'Farseek', 'Inexorable Tide', 'Grim Flayer', 'Thrummingbird', 'Toxic Deluge', 'Anguished Unmaking', 'Merciless Eviction', 'Damnation', 'Oko, Thief of Crowns', 'Wrath of God', 'Supreme Verdict', 'Rampant Growth', 'Ponder', 'Hydroid Krasis', 'Sylvan Library', 'Demonic Tutor'],
    exile: ['Path to Exile', 'Swords to Plowshares', 'Sol Ring', 'Blood Artist', 'Ichor Rats', 'Plaguemaw Beast', 'Viral Drake', 'Deepglow Skate'],
    cmdTaken: { 1: 2, 3: 7 },
  },
  {
    id: 5, user: 'Ines', life: 29, handCount: 3, deck: 60,
    commander: { name: 'Edgar Markov', tax: 0, inPlay: false },
    perms: [
      ...land('Plains', 3, 1), ...land('Swamp', 3, 2), ...land('Mountain', 2), ...land('Command Tower', 1),
      other('Sorin, Imperious Bloodlord', { counters: 4 }),
      creature('Vampire', '1/1', { copies: 5 }), creature('Bloodghast', '2/1'),
    ],
    grave: ['Vampiric Tutor', 'Cordial Vampire', 'Kindred Dominance', 'Feed the Swarm', 'Swords to Plowshares', 'Bloodline Keeper', 'Utter End', 'Anguished Unmaking'],
    exile: ['Sol Ring'],
    cmdTaken: { 4: 4 },
  },
  {
    id: 6, user: 'Odo', life: 33, handCount: 6, deck: 57,
    commander: { name: 'Yuriko, the Tiger\'s Shadow', tax: 2, inPlay: false },
    perms: [
      ...land('Island', 4, 2), ...land('Swamp', 3), ...land('Watery Grave', 1),
      other('Talisman of Dominance'),
      creature('Ingenious Infiltrator', '2/3'), creature('Ninja of the Deep Hours', '2/2', { tapped: true }),
    ],
    grave: ['Brainstorm', 'Ponder', 'Fatal Push', 'Snuff Out', 'Force of Will', 'Mystic Sanctuary'],
    exile: [],
  },
];

const DUEL: SeatSpec[] = [
  {
    id: 1, user: 'Alex', life: 20, handCount: 5, deck: 48,
    perms: [
      ...land('Mountain', 7), ...land('Den of the Bugbear', 1),
      other('Fable of the Mirror-Breaker', { counters: 2 }),
      creature('Monastery Swiftspear', '1/2'), creature('Bonecrusher Giant', '4/3'), creature('Goblin Shaman', '2/2'),
    ],
    hand: ['Lightning Bolt', 'Play with Fire', 'Kumano Faces Kakkazan', 'Heartfire Hero', 'Mountain'],
    grave: ['Lightning Bolt', 'Burst Lightning', 'Monastery Swiftspear', 'Play with Fire'],
    exile: ['Stomp'],
  },
  {
    id: 2, user: 'Kira', life: 20, handCount: 5, deck: 47,
    perms: [
      ...land('Plains', 3), ...land('Island', 4, 1), ...land('Hallowed Fountain', 1),
      other('The Wandering Emperor', { counters: 4 }),
      creature('Brazen Borrower', '3/1'), creature('Elite Spellbinder', '3/1'),
    ],
    grave: ['Consider', 'Memory Deluge', 'Fateful Absence', 'Make Disappear', 'Portable Hole', 'Spell Pierce'],
    exile: [],
  },
];

// Seat order is join order. The board puts the local player near-left and runs
// the ring up the left column, then down the right (useGameBoardLayout).
const SEAT_ORDER: Record<number, number[]> = {
  2: [1, 2],
  3: [1, 4, 3],
  4: [1, 4, 3, 2],
  5: [1, 4, 3, 5, 2],
  6: [1, 4, 3, 5, 2, 6],
};

let nextCardId = 1000;

function placeTable(perms: Perm[]): ServerInfo_Card[] {
  const out: ServerInfo_Card[] = [];
  for (const row of [0, 1, 2] as Row[]) {
    const piles: { name: string; col: number; depth: number }[] = [];
    let nextCol = 0;
    for (const p of perms.filter((q) => q.row === row)) {
      for (let k = 0; k < (p.copies ?? 1); k++) {
        let pile = piles.find((x) => x.name === p.name && x.depth < 3 && !p.counters);
        if (!pile) {
          pile = { name: p.name, col: nextCol++, depth: 0 };
          piles.push(pile);
        }
        out.push(makeCard({
          id: nextCardId++,
          name: p.name,
          x: pile.col * 3 + pile.depth,
          y: row,
          tapped: !!p.tapped,
          attacking: !!p.attacking,
          pt: p.pt ?? '',
          counterList: p.counters ? [create(ServerInfo_CardCounterSchema, { id: 2, value: p.counters })] : [],
        }));
        pile.depth++;
      }
    }
  }
  return out;
}

const listCards = (names: string[]) => names.map((name) => makeCard({ id: nextCardId++, name }));

const COUNTER_NAMES = ['life', 'w', 'u', 'b', 'r', 'g', 'x', 'storm'];
const COUNTER_RGB: [number, number, number][] = [
  [255, 255, 255], [255, 255, 150], [150, 150, 255], [150, 150, 150], [250, 150, 150], [150, 255, 150], [255, 255, 255], [255, 150, 30],
];

function buildPlayer(s: SeatSpec, localId: number): PlayerEntry {
  const counters: PlayerEntry['counters'] = {};
  COUNTER_NAMES.forEach((name, i) => {
    counters[i] = makeCounter({
      id: i,
      name,
      count: i === 0 ? s.life : 0,
      counterColor: create(colorSchema, { r: COUNTER_RGB[i][0], g: COUNTER_RGB[i][1], b: COUNTER_RGB[i][2], a: 255 }),
    });
  });
  const table = placeTable(s.perms);
  const hand = s.id === localId && s.hand ? listCards(s.hand) : [];
  return makePlayerEntry({
    properties: makePlayerProperties({
      playerId: s.id,
      userInfo: makeUser({ name: s.user }),
      pingSeconds: 1,
      readyStart: true,
    }),
    deckList: '',
    counters,
    zones: {
      [ZoneName.TABLE]: makeZoneEntry({ name: ZoneName.TABLE, type: 0, withCoords: true, cards: table, cardCount: table.length }),
      [ZoneName.HAND]: makeZoneEntry({ name: ZoneName.HAND, type: 2, cards: hand, cardCount: s.id === localId ? hand.length : s.handCount }),
      [ZoneName.DECK]: makeZoneEntry({ name: ZoneName.DECK, type: 2, cardCount: s.deck }),
      [ZoneName.GRAVE]: makeZoneEntry({ name: ZoneName.GRAVE, type: 0, cards: listCards(s.grave), cardCount: s.grave.length }),
      [ZoneName.EXILE]: makeZoneEntry({ name: ZoneName.EXILE, type: 0, cards: listCards(s.exile), cardCount: s.exile.length }),
      [ZoneName.SIDEBOARD]: makeZoneEntry({ name: ZoneName.SIDEBOARD, type: 2, cardCount: s.commander ? 0 : 15 }),
      [ZoneName.STACK]: makeZoneEntry({ name: ZoneName.STACK, type: 0, cards: listCards(s.stack ?? []), cardCount: (s.stack ?? []).length }),
    },
  });
}

/** Facts the protocol does not carry yet (command zone, commander damage). The
 *  table layout reads them from here; see the integration plan, step 7. */
export interface PreviewExtras {
  commanders: Record<number, { name: string; tax: number; inPlay: boolean } | undefined>;
  cmdTaken: Record<number, Record<number, number>>;
  proposal: { from: number; to: number; amount: number; card: string } | null;
}

export function buildPreview(n: number, stress = false) {
  nextCardId = 1000;
  const specs = n === 2 ? DUEL : EDH.slice(0, 6);
  const order = SEAT_ORDER[n];
  const seated = order.map((id) => specs.find((s) => s.id === id)!);
  const localId = 1;
  const players: Record<number, PlayerEntry> = {};
  for (const s of seated) {
    players[s.id] = buildPlayer(s, localId);
  }

  // Ravi's Atraxa attacks you; Tomo's Old Gnawbone attacks Kess. Player-target arrows.
  if (n >= 4) {
    const atraxa = players[4].zones[ZoneName.TABLE].order.find((id) => players[4].zones[ZoneName.TABLE].byId[id].name.startsWith('Atraxa'))!;
    const gnaw = players[3].zones[ZoneName.TABLE].order.find((id) => players[3].zones[ZoneName.TABLE].byId[id].name === 'Old Gnawbone')!;
    players[4].arrows[1] = create(ServerInfo_ArrowSchema, {
      id: 1, startPlayerId: 4, startZone: ZoneName.TABLE, startCardId: atraxa,
      targetPlayerId: 1, targetZone: '', targetCardId: -1,
      arrowColor: create(colorSchema, { r: 255, g: 0, b: 0, a: 255 }),
    });
    players[3].arrows[2] = create(ServerInfo_ArrowSchema, {
      id: 2, startPlayerId: 3, startZone: ZoneName.TABLE, startCardId: gnaw,
      targetPlayerId: 2, targetZone: '', targetCardId: -1,
      arrowColor: create(colorSchema, { r: 255, g: 0, b: 0, a: 255 }),
    });
  }


  // Adversarial board for critique #2-#5: more promoted lands than the lane holds, a non-land in
  // the land row, columns far past the visible cells, a face-down card, an aura on a land, and
  // an arrow aimed at a land folded into a shelf tile.
  if (stress && n >= 4) {
    const put = (pid: number, card: ServerInfo_Card) => {
      const z = players[pid].zones[ZoneName.TABLE];
      z.order.push(card.id);
      z.byId[card.id] = card;
      z.cardCount += 1;
    };
    const ctr = (v: number) => [create(ServerInfo_CardCounterSchema, { id: 0, value: v })];
    put(2, makeCard({ id: 9001, name: 'Gemstone Mine', x: 30, y: 2, counterList: ctr(2) }));
    put(2, makeCard({ id: 9002, name: 'Mutavault', x: 33, y: 2, annotation: 'animated' }));
    put(2, makeCard({ id: 9003, name: "Hall of Heliod's Generosity", x: 36, y: 2, counterList: ctr(1) }));
    put(2, makeCard({ id: 9004, name: 'Sol Ring', x: 39, y: 2 }));
    put(2, makeCard({ id: 9005, name: 'Spellstutter Sprite', x: 25 * 3, y: 0, pt: '1/1' }));
    put(2, makeCard({ id: 9006, name: 'Faerie Rogue', x: 40 * 3, y: 0, pt: '1/1' }));
    put(2, makeCard({ id: 9007, name: '', x: 9 * 3, y: 0, faceDown: true, pt: '2/2' }));
    const raviForest = players[4].zones[ZoneName.TABLE].order.find((id) => players[4].zones[ZoneName.TABLE].byId[id].name === 'Forest')!;
    put(4, makeCard({ id: 9008, name: 'Utopia Sprawl', x: 0, y: 1, attachPlayerId: 4, attachZone: ZoneName.TABLE, attachCardId: raviForest }));
    const myForests = players[1].zones[ZoneName.TABLE].order.filter((id) => players[1].zones[ZoneName.TABLE].byId[id].name === 'Forest');
    const dragon = players[3].zones[ZoneName.TABLE].order.find((id) => players[3].zones[ZoneName.TABLE].byId[id].name === 'Dragon')!;
    players[3].arrows[3] = create(ServerInfo_ArrowSchema, {
      id: 3, startPlayerId: 3, startZone: ZoneName.TABLE, startCardId: dragon,
      targetPlayerId: 1, targetZone: ZoneName.TABLE, targetCardId: myForests[2],
      arrowColor: create(colorSchema, { r: 255, g: 0, b: 0, a: 255 }),
    });
  }

  const now = Date.now();
  const say = (playerId: number, message: string, ago: number) => ({ playerId, message, timeReceived: now - ago * 1000, kind: 'event' as const });
  const messages = n === 2
    ? [say(2, 'Kira casts Elite Spellbinder.', 90), say(2, 'Kira passes the turn.', 60), say(1, 'Alex untaps and draws a card.', 30)]
    : [say(3, 'Tomo attacks Kess with Old Gnawbone.', 50), say(2, 'Kess casts Brainstorm.', 40),
      say(4, 'Ravi attacks Alex with Atraxa, Praetors\' Voice.', 20)];

  const game: GameEntry = makeGameEntry({
    info: makeGameInfo({
      gameId: 1, roomId: 1, description: n === 2 ? 'Modern · best of three' : 'Commander · casual',
      started: true, maxPlayers: n, playerCount: n, spectatorsAllowed: true, spectatorsCount: 2,
    }),
    hostId: 1,
    localPlayerId: localId,
    started: true,
    activePlayerId: n === 2 ? 1 : 4,
    activePhase: n === 2 ? 3 : 5,
    secondsElapsed: n === 2 ? 760 : 2462,
    players,
    seatOrder: order,
    messages,
  });

  const extras: PreviewExtras = {
    commanders: Object.fromEntries(seated.map((s) => [s.id, s.commander])),
    cmdTaken: Object.fromEntries(seated.map((s) => [s.id, s.cmdTaken ?? {}])),
    proposal: n >= 4 ? { from: 4, to: 1, amount: 7, card: 'Atraxa, Praetors\' Voice' } : null,
  };

  const me = makeUser({ name: 'Alex' });
  const state = {
    server: {
      initialized: true,
      testConnectionStatus: null,
      buddyList: {},
      ignoreList: {},
      status: { connectionAttemptMade: true, state: WebsocketTypes.StatusEnum.LOGGED_IN, description: null },
      info: { message: null, name: 'Rooster Ranges', version: '2.10.0' },
      logs: { room: [], game: [], chat: [] },
      user: me,
      users: { Alex: me },
      sortUsersBy: { field: UserSortField.NAME, order: SortDirection.ASC },
      messages: {},
      userInfo: {},
      notifications: [],
      serverShutdown: null,
      banUser: '',
      banHistory: {},
      warnHistory: {},
      warnListOptions: [],
      warnUser: '',
      adminNotes: {},
      replays: {},
      backendDecks: null,
      downloadedDeck: null,
      downloadedReplay: null,
      gamesOfUser: {},
      registrationError: null,
    },
    rooms: {
      rooms: {},
      joinedRoomIds: {},
      joinedGameIds: { 1: { 1: true } },
      messages: {},
      sortGamesBy: { field: GameSortField.START_TIME, order: SortDirection.DESC },
      sortUsersBy: { field: UserSortField.NAME, order: SortDirection.ASC },
      selectedGameIds: {},
      gameFilters: {},
      joinGamePending: false,
      joinGameError: null,
    },
    games: { games: { 1: game }, incomingReveal: null },
  };
  return { state, extras };
}
