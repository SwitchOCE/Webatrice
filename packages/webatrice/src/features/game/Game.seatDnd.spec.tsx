// Seat drags run on the game's one DnD coordinator (useGameDnd, PB-16). For
// each converted seat source these pin the convergence gate: one command per
// gesture, only the sensor's window listeners while dragging (no second, seat
// level handler), and the ghost portal and grabbing cursor gone after the drop.

import { act, fireEvent } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { createMockWebClient, renderWithProviders } from '../../__test-utils__';
import { battlefieldEl, buildSeatGameState, cardEl, layoutBoxes, pileEl } from './__test-utils__/seatFixtures';
import Game from './Game';

vi.mock('../../hooks/useSettings');

vi.mock('../../services/cards/cardCatalog', () => {
  const unknown = (name: string) => ({ found: false, source: 'unknown', name, printings: [] });
  return {
    lookupCard: vi.fn(async (name: string) => unknown(name)),
    lookupCards: vi.fn(async (inputs: Array<string | { name: string }>) =>
      new Map(inputs.map((i) => {
        const name = typeof i === 'string' ? i : i.name;
        return [name, unknown(name)];
      }))),
    lookupCardsCached: vi.fn(async (names: string[]) => new Map(names.map((n) => [n, unknown(n)]))),
    fetchAllPrintings: vi.fn(async () => []),
  };
});

const BOLT = makeCard({ id: 10, name: 'Bolt', x: 3, y: 1 });
const SHOCK = makeCard({ id: 30, name: 'Shock' });
const OPT = makeCard({ id: 31, name: 'Opt' });
const COUNTER = makeCard({ id: 50, name: 'Counterspell' });
const DURESS = makeCard({ id: 40, name: 'Duress' });

const BF_BOX = { left: 0, top: 0, width: 800, height: 400 };
const GRAVE_BOX = { left: 981, top: 200, width: 80, height: 110 };
const STACK_BOX = { left: 1100, top: 0, width: 100, height: 400 };
const HAND_BOX = { left: 0, top: 500, width: 800, height: 120 };

function renderLaidOut() {
  const webClient = createMockWebClient();
  renderWithProviders(<Game />, {
    preloadedState: buildSeatGameState({
      localPlayerId: 1,
      seats: [
        { playerId: 1, table: [BOLT], hand: [SHOCK, OPT], grave: [DURESS], stack: [COUNTER], deckCount: 40 },
        { playerId: 2, handCount: 5, deckCount: 33 },
      ],
    }),
    webClient,
  });
  const ownBf = battlefieldEl(1);
  const grave = pileEl('Graveyard', 0);
  const shock = cardEl(SHOCK.id, 'hand');
  const opt = cardEl(OPT.id, 'hand');
  const handRow = shock.closest('.overflow-x-auto');
  const stack = cardEl(COUNTER.id, 'stack').closest('.min-h-0.relative');
  layoutBoxes([
    [(el) => el === ownBf || el === ownBf.firstElementChild, BF_BOX],
    [(el) => el === grave, GRAVE_BOX],
    [(el) => el === stack, STACK_BOX],
    [(el) => el === handRow, HAND_BOX],
    [(el) => el === shock, { left: 0, top: 500, width: 72, height: 100 }],
    [(el) => el === opt, { left: 80, top: 500, width: 72, height: 100 }],
  ]);
  return webClient.request.game;
}

function trackWindowListeners() {
  const live = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (listener) {
      live.set(type, (live.get(type) ?? new Set()).add(listener));
    }
    add(type, listener, options);
  });
  vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (listener) {
      live.get(type)?.delete(listener);
    }
    remove(type, listener, options);
  });
  return (type: string) => live.get(type)?.size ?? 0;
}

const ghosts = () => document.querySelectorAll('[data-drag-ghost]');

/** Press, move past the threshold, check the in-flight state, release. */
function dragThrough(
  source: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  during: () => void,
) {
  act(() => {
    fireEvent.pointerDown(source, { button: 0, clientX: from.x, clientY: from.y });
  });
  act(() => {
    fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y });
  });
  during();
  act(() => {
    fireEvent.pointerUp(window, { button: 0, clientX: to.x, clientY: to.y });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seat drags on the game DnD coordinator', () => {
  it.each([
    ['hand → hand', SHOCK.id, 'hand', { x: 10, y: 510 }, { x: 200, y: 550 },
      { startZone: ZoneName.HAND, targetZone: ZoneName.HAND, x: 1 }],
    ['hand → stack', SHOCK.id, 'hand', { x: 10, y: 510 }, { x: 1150, y: 390 },
      { startZone: ZoneName.HAND, targetZone: ZoneName.STACK, x: 1 }],
    ['stack → graveyard', COUNTER.id, 'stack', { x: 1110, y: 10 }, { x: 1000, y: 250 },
      { startZone: ZoneName.STACK, targetZone: ZoneName.GRAVE }],
  ] as const)('%s: one command, one sensor listener, ghost and cursor cleaned up', (_label, cardId, zone, from, to, move) => {
    const game = renderLaidOut();
    const live = trackWindowListeners();

    dragThrough(cardEl(cardId, zone), from, to, () => {
      expect(live('pointermove')).toBe(1);
      expect(live('pointerup')).toBe(1);
      expect(ghosts()).toHaveLength(1);
      expect(document.body.style.cursor).toBe('grabbing');
    });

    expect(game.moveCard).toHaveBeenCalledTimes(1);
    expect(vi.mocked(game.moveCard).mock.calls[0][1]).toMatchObject({ ...move, cardsToMove: { card: [{ cardId }] } });
    expect(live('pointermove')).toBe(0);
    expect(live('pointerup')).toBe(0);
    expect(ghosts()).toHaveLength(0);
    expect(document.body.style.cursor).toBe('');
  });

  it('hides the dragged hand card while the ghost carries it', () => {
    renderLaidOut();

    dragThrough(cardEl(SHOCK.id, 'hand'), { x: 10, y: 510 }, { x: 400, y: 200 }, () => {
      expect(cardEl(SHOCK.id, 'hand')).toHaveStyle({ opacity: '0' });
    });
  });
});
