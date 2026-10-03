// Shared fixtures for the game-seat characterization specs
// (PlayerBoard.characterization, GameBoardCell, Game.dragdrop, Game.orchestration).
//
// The seat surface is driven end-to-end through real Redux state, so these
// helpers build a `games` slice with explicit per-zone contents and the
// Servatrice-shaped counter set (life + the seven mana counters), plus the DOM
// helpers the specs share for menus, pointer drags and jsdom layout.

import { createElement } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import {
  makeCounter,
  makeGameEntry,
  makeGameInfo,
  makePlayerEntry,
  makePlayerProperties,
  makeZoneEntry,
} from '@cockatrice/datatrice/testing';
import { connectedState, createMockWebClient, makeStoreState, makeUser, renderWithProviders } from '../../../__test-utils__';
import GameBoardCell from '../components/ui/GameBoardCell/GameBoardCell';
import type { BoardCell } from '../hooks/useGameBoardLayout';

export const LIFE_COUNTER_ID = 1;

// Servatrice pre-creates these on seat (server_player.cpp); GameBoardCell maps
// them to the W/U/B/R/G/C/O pips by wire name.
const MANA_COUNTER_NAMES = ['w', 'u', 'b', 'r', 'g', 'x', 'storm'] as const;
export const MANA_COUNTER_IDS: Record<(typeof MANA_COUNTER_NAMES)[number], number> = {
  w: 2,
  u: 3,
  b: 4,
  r: 5,
  g: 6,
  x: 7,
  storm: 8,
};

export interface SeatSpec {
  playerId: number;
  name?: string;
  table?: ServerInfo_Card[];
  /** Hand cards known to the local client (own seat, or omniscient view). */
  hand?: ServerInfo_Card[];
  /** Authoritative hand size. Defaults to `hand.length`; set it alone for a
   *  hidden hand whose contents the client never receives. */
  handCount?: number;
  /** Authoritative library size. The library is a hidden zone, so its `order`
   *  stays empty and only the count is known. */
  deckCount?: number;
  grave?: ServerInfo_Card[];
  exile?: ServerInfo_Card[];
  stack?: ServerInfo_Card[];
  sideboardCount?: number;
  life?: number;
  deckList?: string;
}

export interface SeatGameSpec {
  localPlayerId: number;
  seats: SeatSpec[];
  activePlayerId?: number;
  hostId?: number;
  started?: boolean;
  spectator?: boolean;
  judge?: boolean;
  omniscient?: boolean;
}

function counterSet(life: number) {
  const counters: Record<number, ReturnType<typeof makeCounter>> = {
    [LIFE_COUNTER_ID]: makeCounter({ id: LIFE_COUNTER_ID, name: 'life', count: life }),
  };
  for (const name of MANA_COUNTER_NAMES) {
    const id = MANA_COUNTER_IDS[name];
    counters[id] = makeCounter({ id, name, count: 0 });
  }
  return counters;
}

export function makeSeat(seat: SeatSpec) {
  const zone = (name: (typeof ZoneName)[keyof typeof ZoneName], cards: ServerInfo_Card[] = [], cardCount = cards.length) =>
    makeZoneEntry({ name, cards, cardCount });
  return makePlayerEntry({
    properties: makePlayerProperties({
      playerId: seat.playerId,
      userInfo: makeUser({ name: seat.name ?? `P${seat.playerId}` }),
    }),
    deckList: seat.deckList ?? '',
    counters: counterSet(seat.life ?? 20),
    zones: {
      [ZoneName.TABLE]: zone(ZoneName.TABLE, seat.table),
      [ZoneName.HAND]: zone(ZoneName.HAND, seat.hand, seat.handCount ?? seat.hand?.length ?? 0),
      [ZoneName.DECK]: zone(ZoneName.DECK, [], seat.deckCount ?? 40),
      [ZoneName.GRAVE]: zone(ZoneName.GRAVE, seat.grave),
      [ZoneName.EXILE]: zone(ZoneName.EXILE, seat.exile),
      [ZoneName.STACK]: zone(ZoneName.STACK, seat.stack),
      [ZoneName.SIDEBOARD]: zone(ZoneName.SIDEBOARD, [], seat.sideboardCount ?? 0),
    },
  });
}

export function buildSeatGameState({
  localPlayerId,
  seats,
  activePlayerId = seats[0]?.playerId ?? 0,
  hostId = localPlayerId,
  started = true,
  spectator = false,
  judge = false,
  omniscient = false,
}: SeatGameSpec) {
  const players: Record<number, ReturnType<typeof makePlayerEntry>> = {};
  for (const seat of seats) {
    players[seat.playerId] = makeSeat(seat);
  }
  return makeStoreState({
    ...connectedState,
    games: {
      games: {
        1: makeGameEntry({
          localPlayerId,
          hostId,
          spectator,
          judge,
          started,
          activePlayerId,
          players,
          info: makeGameInfo({ started, spectatorsOmniscient: omniscient }),
        }),
      },
    },
  });
}

// --- Hook helper -----------------------------------------------------------

/** Render a seat hook inside the full provider stack (game 1, mock WebClient)
 *  and expose its latest result, the store and the game request spies. */
export function renderSeatHook<T>(
  useHook: () => T,
  spec: SeatGameSpec,
  mutate?: (state: ReturnType<typeof buildSeatGameState>) => void,
) {
  const preloadedState = buildSeatGameState(spec);
  mutate?.(preloadedState);
  const webClient = createMockWebClient();
  let latest: T | undefined;
  function Probe() {
    latest = useHook();
    return null;
  }
  const utils = renderWithProviders(createElement(Probe), { preloadedState, webClient });
  return { ...utils, result: () => latest as T, game: webClient.request.game };
}

/** Render one seat (GameBoardCell → PlayerBoard, with the real seat model and
 *  command ports) on its own: the given player's cell, local when it is the
 *  spec's local player and mirrored otherwise. Exposes the game request spies. */
export function renderSeatCell(
  spec: SeatGameSpec,
  playerId: number = spec.localPlayerId,
  options: Omit<Parameters<typeof renderWithProviders>[1], 'preloadedState' | 'webClient'> = {},
) {
  const preloadedState = buildSeatGameState(spec);
  const webClient = createMockWebClient();
  const isLocal = playerId === spec.localPlayerId;
  const cell: BoardCell = { playerId, isLocal, mirrored: !isLocal, canAct: isLocal, showHand: isLocal, row: 0, col: 0 };
  const utils = renderWithProviders(
    createElement(GameBoardCell, { cell, totalPlayers: spec.seats.length }),
    { ...options, preloadedState, webClient },
  );
  return { ...utils, game: webClient.request.game };
}

// --- Menu helpers ----------------------------------------------------------

const MENU_SELECTOR = '[data-context-menu], [data-card-context-menu]';

/** Every currently-open seat menu popup (zone/pile menus and card menus). */
export function openMenus(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(MENU_SELECTOR));
}

/** Labels of one menu's own rows, in order, without shortcut hints or chevrons.
 *  Disabled rows are suffixed with ` (disabled)`. */
export function menuLabels(menu: HTMLElement): string[] {
  return Array.from(menu.querySelectorAll<HTMLButtonElement>(':scope > div > button, :scope > button')).map(
    (button) => {
      const label = button.querySelector('span.flex-1')?.textContent?.trim() ?? '';
      return button.disabled ? `${label} (disabled)` : label;
    },
  );
}

/** Right-clicks `el` and returns the menu it opened (the newest popup). */
export function openContextMenu(el: Element): HTMLElement {
  const before = new Set(openMenus());
  act(() => {
    fireEvent.contextMenu(el, { clientX: 10, clientY: 10 });
  });
  const opened = openMenus().filter((menu) => !before.has(menu));
  if (opened.length !== 1) {
    throw new Error(`expected one new menu, found ${opened.length}`);
  }
  return opened[0];
}

function findMenuButton(label: string): HTMLButtonElement {
  for (const menu of openMenus().reverse()) {
    for (const button of menu.querySelectorAll<HTMLButtonElement>('button')) {
      if (button.querySelector('span.flex-1')?.textContent?.trim() === label) {
        return button;
      }
    }
  }
  throw new Error(`no open menu item labelled "${label}"`);
}

/** Clicks a menu path, hovering each submenu parent first:
 *  `chooseMenuPath('Move to', 'Graveyard')`. */
export function chooseMenuPath(...labels: string[]) {
  labels.forEach((label, i) => {
    const button = findMenuButton(label);
    if (i < labels.length - 1) {
      act(() => {
        fireEvent.mouseEnter(button);
      });
    } else {
      act(() => {
        fireEvent.click(button);
      });
    }
  });
}

/** Seat menus arm their outside-click/Escape listeners on a zero-delay timer;
 *  flush it, then press Escape. */
export async function dismissMenus() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  act(() => {
    fireEvent.keyDown(document, { key: 'Escape' });
  });
}

// --- Seat anchors ----------------------------------------------------------

export function cardEl(cardId: number, zone?: 'battlefield' | 'hand' | 'stack'): HTMLElement {
  const selector = zone ? `[data-card][data-zone="${zone}"][data-card-id="${cardId}"]` : `[data-card][data-card-id="${cardId}"]`;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) {
    throw new Error(`no card element for ${selector}`);
  }
  return el;
}

export function battlefieldEl(ownerId: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-battlefield-owner="${ownerId}"]`);
  if (!el) {
    throw new Error(`no battlefield for player ${ownerId}`);
  }
  return el;
}

/** The pile boxes carry their counts in a `title` ("Library — 40"). Seats are
 *  rendered local seat first. */
export function pileEl(label: 'Library' | 'Graveyard' | 'Exile' | 'Hand', seatIndex = 0): HTMLElement {
  return screen.getAllByTitle(new RegExp(`^${label} — `))[seatIndex];
}

// --- jsdom layout ----------------------------------------------------------

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const OFFSCREEN: Box = { left: -10_000, top: -10_000, width: 0, height: 0 };

function toRect({ left, top, width, height }: Box): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** jsdom has no layout. Gives the elements matched by each predicate a fixed
 *  box (first match wins); everything else sits off-screen so hit-tests that
 *  scan the document only see the zones a test laid out. */
export function layoutBoxes(boxes: Array<[(el: Element) => boolean, Box]>) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function boxFor(this: Element) {
    for (const [matches, box] of boxes) {
      if (matches(this)) {
        return toRect(box);
      }
    }
    return toRect(OFFSCREEN);
  });
}

/** Presses on `source` at `from`, moves to `to` and releases there — the
 *  seat pointer drag (window-level pointermove/pointerup listeners). */
export function pointerDrag(source: Element, from: { x: number; y: number }, to: { x: number; y: number }) {
  act(() => {
    fireEvent.pointerDown(source, { button: 0, clientX: from.x, clientY: from.y });
  });
  act(() => {
    fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y });
  });
  act(() => {
    fireEvent.pointerUp(window, { button: 0, clientX: to.x, clientY: to.y });
  });
}
