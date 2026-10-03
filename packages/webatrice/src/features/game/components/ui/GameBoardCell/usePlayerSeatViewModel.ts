import { useMemo } from 'react';

import { games } from '@cockatrice/datatrice';
import { ZoneName, isBuiltinZone } from '@cockatrice/sockatrice';
import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import { parseCod } from '@app/services';
import { useAppSelector } from '@app/store';

import type { BoardCell } from '../../../hooks/useGameBoardLayout';
import { avatarSrc } from '../../../utils/avatarSrc';
import { useGameId } from '../GameIdContext';
import type {
  BattlefieldCardViewModel,
  ManaSymbol,
  PlayerBoardModel,
  PlayerCardViewModel,
  PlayerCounterViewModel,
  SeatDeckCard,
} from '../PlayerBoard/playerBoard.types';

// Projects one seat's Datatrice state into the PlayerBoardModel. Reads only;
// every command lives in the usePlayer*Commands hooks.

// Life is just a counter named "life" (case-insensitive) in Cockatrice's
// protocol — no special-cased life field on players.
function isLifeCounter(c: { name: string }): boolean {
  return c.name.trim().toLowerCase() === 'life';
}

// Servatrice pre-creates counters 1-7 with wire names "w"/"u"/"b"/"r"/"g"/"x"/
// "storm" (server_player.cpp:96-102). Desktop labels "storm" "Other".
const MANA_SYMBOL_BY_WIRE_NAME: Record<string, ManaSymbol> = {
  w: 'W',
  u: 'U',
  b: 'B',
  r: 'R',
  g: 'G',
  x: 'C',
  storm: 'O',
};

// Stable empty references for the pre-hydration transient, so downstream memos
// don't invalidate on every render while a player has no zone data yet.
const EMPTY_CARDS: PlayerCardViewModel[] = [];
const EMPTY_BATTLEFIELD_CARDS: BattlefieldCardViewModel[] = [];
const EMPTY_DECK: SeatDeckCard[] = [];

type ZoneCards = { order: number[]; byId: Record<number, ServerInfo_Card> };

/** Project a public zone (byId + order) into seat cards. `order` runs bottom →
 *  top, so the last entry is the top of the pile. */
export function zoneToSeatCards(zone: ZoneCards | undefined): PlayerCardViewModel[] {
  if (!zone) {
    return EMPTY_CARDS;
  }
  return zone.order.map((id) => {
    const card = zone.byId[id];
    return {
      id: String(id),
      name: card?.name ?? '',
      scryfallId: card?.providerId ?? '',
      annotation: card?.annotation || undefined,
    };
  });
}

/** The name a seat shows: the player's, or a placeholder until it arrives. */
export function seatDisplayName(realName: string | undefined, isLocal: boolean, playerId: number): string {
  return realName ?? (isLocal ? 'You' : `Player ${playerId}`);
}

/** Project a Response_DumpZone snapshot. Falls back to the array index when the
 *  server didn't set an id (Cockatrice reveal-list quirk). */
export function revealedCardsToSeatCards(
  cards: readonly { id: number; name: string; providerId: string }[] | undefined,
): PlayerCardViewModel[] {
  if (!cards || cards.length === 0) {
    return EMPTY_CARDS;
  }
  return cards.map((c, idx) => ({
    id: String(c.id ?? idx),
    name: c.name ?? '',
    scryfallId: c.providerId ?? '',
  }));
}

/** Decode one TABLE card. Wire `x / 3` is the stack column and `x % 3` the
 *  sub-slot; `attachCardId === -1` is the unattached sentinel. */
export function projectBattlefieldCard(
  id: number,
  card: ServerInfo_Card | undefined,
  ownerPlayerId: number,
): BattlefieldCardViewModel {
  const wireX = Math.max(0, card?.x ?? 0);
  const attachCardId = card?.attachCardId ?? -1;
  const attachPlayerId = card?.attachPlayerId ?? -1;
  return {
    id: String(id),
    ownerPlayerId,
    name: card?.name ?? '',
    scryfallId: card?.providerId ?? '',
    slot: {
      row: Math.max(0, card?.y ?? 0),
      col: Math.floor(wireX / 3),
    },
    subSlot: wireX % 3,
    tapped: card?.tapped ?? false,
    faceDown: card?.faceDown ?? false,
    pt: card?.pt || undefined,
    doesntUntap: card?.doesntUntap ?? false,
    color: card?.color || undefined,
    annotation: card?.annotation || undefined,
    attachTargetCardId: attachCardId >= 0 ? attachCardId : undefined,
    attachTargetPlayerId: attachCardId >= 0 ? attachPlayerId : undefined,
    // Servatrice strips zero-valued counters, so the list holds active ones only.
    counters: card?.counterList,
  };
}

/**
 * The seat's battlefield. A card attached to another player's card still lives
 * in its owner's TABLE zone (Servatrice never moves it), but desktop re-parents
 * it in the scene graph. So: drop own cards attached to another player, then
 * append other players' cards attached to this player's cards, each keeping its
 * true `ownerPlayerId` so commands still address the right zone.
 */
export function projectBattlefield(
  playerId: number,
  tableZone: ZoneCards | undefined,
  allPlayers: Record<number, { zones: Record<string, ZoneCards | undefined> } | undefined> | undefined,
): BattlefieldCardViewModel[] {
  const own = tableZone
    ? tableZone.order.reduce<BattlefieldCardViewModel[]>((acc, id) => {
      const c = tableZone.byId[id];
      const attachCardId = c?.attachCardId ?? -1;
      const attachPlayerId = c?.attachPlayerId ?? -1;
      const attachZone = c?.attachZone ?? '';
      const attachedElsewhere =
        attachCardId >= 0
        && attachZone === ZoneName.TABLE
        && attachPlayerId !== playerId;
      if (!attachedElsewhere) {
        acc.push(projectBattlefieldCard(id, c, playerId));
      }
      return acc;
    }, [])
    : EMPTY_BATTLEFIELD_CARDS;

  const foreignChildren: BattlefieldCardViewModel[] = [];
  for (const [ownerIdStr, otherPlayer] of Object.entries(allPlayers ?? {})) {
    const otherOwnerId = Number(ownerIdStr);
    const otherTable = otherPlayer?.zones[ZoneName.TABLE];
    if (otherOwnerId === playerId || !otherTable) {
      continue;
    }
    for (const cid of otherTable.order) {
      const c = otherTable.byId[cid];
      if (c && c.attachCardId >= 0 && c.attachZone === ZoneName.TABLE && c.attachPlayerId === playerId) {
        foreignChildren.push(projectBattlefieldCard(cid, c, otherOwnerId));
      }
    }
  }
  return foreignChildren.length === 0 ? own : own.concat(foreignChildren);
}

function projectCounters(
  countersMap: Record<number, { id: number; name: string; count: number }> | undefined,
): PlayerCounterViewModel {
  if (!countersMap) {
    return { life: undefined, mana: undefined };
  }
  const counters = Object.values(countersMap);
  const life = counters.find(isLifeCounter);
  const mana: Partial<Record<ManaSymbol, { id: number; count: number }>> = {};
  for (const c of counters) {
    const symbol = MANA_SYMBOL_BY_WIRE_NAME[c.name.trim().toLowerCase()];
    if (symbol) {
      mana[symbol] = { id: c.id, count: c.count };
    }
  }
  return {
    // ServerInfo_Counter stores the current amount in `count`.
    life: life ? { id: life.id, value: life.count } : undefined,
    mana,
  };
}

/** The cards of a `.cod` deck list; empty when there is none or it doesn't parse. */
export function deckListToSeatDeck(deckList: string | undefined): readonly SeatDeckCard[] {
  if (!deckList) {
    return EMPTY_DECK;
  }
  try {
    return parseCod(deckList).cards.map((c) => ({
      name: c.name,
      scryfallId: c.scryfallId ?? '',
      sideboard: c.category === 'sideboard',
    }));
  } catch {
    return EMPTY_DECK;
  }
}

/**
 * The PlayerBoardModel for one board cell. Hidden-zone counts come from the
 * authoritative `cardCount`, never from the (partial) local order; the hand's
 * cards are only ever present for the owner because Datatrice only holds them
 * there.
 */
export function usePlayerSeatViewModel(cell: BoardCell, totalPlayers: number): PlayerBoardModel {
  const gameId = useGameId();
  const { playerId, isLocal, mirrored, canAct } = cell;

  const player = useAppSelector((state) =>
    gameId != null ? games.Selectors.getPlayer(state, gameId, playerId) : undefined,
  );
  const countersMap = useAppSelector((state) =>
    gameId != null ? games.Selectors.getCounters(state, gameId, playerId) : undefined,
  );
  const activePlayerId = useAppSelector((state) =>
    gameId != null ? games.Selectors.getActivePlayerId(state, gameId) : undefined,
  );
  const seatedPlayers = useAppSelector((state) =>
    gameId != null ? games.Selectors.getSeatedPlayers(state, gameId) : undefined,
  );
  const allPlayers = useAppSelector((state) =>
    gameId != null ? games.Selectors.getPlayers(state, gameId) : undefined,
  );

  // Desktop's reveal submenus exclude the current player (library_menu.cpp:271-273).
  const revealTargets = useMemo(
    () =>
      (seatedPlayers ?? [])
        .filter((p) => p.properties.playerId !== playerId)
        .map((p) => ({
          playerId: p.properties.playerId,
          name: p.properties.userInfo?.name ?? `Player ${p.properties.playerId}`,
        })),
    [seatedPlayers, playerId],
  );

  const realName = player?.properties.userInfo?.name;
  const avatarBmp = player?.properties.userInfo?.avatarBmp;
  const avatarUrl = useMemo(() => avatarSrc(avatarBmp), [avatarBmp]);
  const hydrated = player != null;
  const isActive = hydrated && playerId === activePlayerId;
  const flipHandCardBacks = totalPlayers !== 3;
  const drawSeq = player?.drawSeq ?? 0;
  const lastDrawCount = player?.lastDrawCount ?? 0;

  const seat = useMemo(
    () => ({
      playerId,
      hydrated,
      isLocal,
      mirrored,
      isActive,
      displayName: seatDisplayName(realName, isLocal, playerId),
      username: realName ?? (isLocal ? 'you' : `player-${playerId}`),
      avatarUrl,
      flipHandCardBacks,
      drawSeq,
      lastDrawCount,
      revealTargets,
    }),
    [playerId, hydrated, isLocal, mirrored, isActive, realName, avatarUrl, flipHandCardBacks, drawSeq, lastDrawCount, revealTargets],
  );

  const deckList = player?.deckList;
  const deck = useMemo(() => deckListToSeatDeck(deckList), [deckList]);
  const counters = useMemo(() => projectCounters(countersMap), [countersMap]);
  const permissions = useMemo(() => ({ isOwner: isLocal, canAct }), [isLocal, canAct]);

  const handZone = player?.zones[ZoneName.HAND];
  const deckZone = player?.zones[ZoneName.DECK];
  const graveZone = player?.zones[ZoneName.GRAVE];
  const exileZone = player?.zones[ZoneName.EXILE];
  const stackZone = player?.zones[ZoneName.STACK];
  const tableZone = player?.zones[ZoneName.TABLE];
  const sideboardZone = player?.zones[ZoneName.SIDEBOARD];

  const hand = useMemo(
    () => ({ cards: zoneToSeatCards(handZone), cardCount: handZone?.cardCount }),
    [handZone],
  );
  const graveyard = useMemo(
    () => ({ cards: zoneToSeatCards(graveZone), cardCount: graveZone?.cardCount }),
    [graveZone],
  );
  const exile = useMemo(
    () => ({ cards: zoneToSeatCards(exileZone), cardCount: exileZone?.cardCount }),
    [exileZone],
  );
  const stack = useMemo(
    () => ({ cards: zoneToSeatCards(stackZone), cardCount: stackZone?.cardCount }),
    [stackZone],
  );
  const library = useMemo(() => {
    const top = deckZone?.topRevealedCard;
    return {
      cardCount: deckZone?.cardCount,
      revealedCards: revealedCardsToSeatCards(deckZone?.revealedCards),
      // Populated by Servatrice's revealTopCardIfNeeded (server_abstract_player.cpp:553-580).
      topCard: top ? { name: top.name, scryfallId: top.providerId } : null,
      alwaysRevealTopCard: deckZone?.alwaysRevealTopCard ?? false,
      alwaysLookAtTopCard: deckZone?.alwaysLookAtTopCard ?? false,
    };
  }, [deckZone]);
  // A HiddenZone: Servatrice sends only the count until a Command_DumpZone.
  const sideboardCount = sideboardZone?.cardCount;
  const sideboardRevealed = sideboardZone?.revealedCards;
  const sideboard = useMemo(
    () => ({
      cardCount: sideboardCount,
      revealedCards: revealedCardsToSeatCards(sideboardRevealed),
    }),
    [sideboardCount, sideboardRevealed],
  );
  const battlefield = useMemo(
    () => ({ cards: projectBattlefield(playerId, tableZone, allPlayers) }),
    [playerId, tableZone, allPlayers],
  );

  // Desktop makes every other ServerInfo_Zone a custom zone (player_logic.cpp:98-170).
  const allZones = player?.zones;
  const customZones = useMemo(
    () => Object.values(allZones ?? {})
      .filter((z) => !isBuiltinZone(z.name))
      .map((z) => ({ name: z.name, type: z.type, withCoords: z.withCoords, cardCount: z.cardCount })),
    [allZones],
  );

  const zones = useMemo(
    () => ({ hand, library, graveyard, exile, stack, battlefield, sideboard, customZones }),
    [hand, library, graveyard, exile, stack, battlefield, sideboard, customZones],
  );

  return useMemo(
    () => ({ seat, deck, zones, counters, permissions }),
    [seat, deck, zones, counters, permissions],
  );
}
