// Seat shortcuts through the real ShortcutProvider: useGameShortcuts owns every
// game key binding and runs the local seat's published operations, so each
// keystroke reaches exactly one handler and sends exactly one command set.

import { act, fireEvent, screen } from '@testing-library/react';
import { makeArrow, makeCard } from '@cockatrice/datatrice/testing';

import { ShortcutProvider } from '@app/feature-widgets/shortcuts';
import { usePreferences } from '@app/hooks';
import { PREFERENCE_DEFAULTS } from '@app/types';
import { shortcuts } from '@app/store';
import { createMockWebClient, renderWithProviders } from '../../__test-utils__';
import {
  buildSeatGameState,
  cardEl,
  chooseMenuPath,
  openContextMenu,
  type SeatGameSpec,
} from './__test-utils__/seatFixtures';
import Game from './Game';

vi.mock('../../hooks/useSettings');

vi.mock('../../services/cards/catalog/lookup', () => {
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

function seatState(spec: Partial<SeatGameSpec> = {}) {
  const state = buildSeatGameState({
    localPlayerId: 1,
    seats: [
      { playerId: 1, deckCount: 40, hand: [] },
      { playerId: 2, deckCount: 40 },
    ],
    ...spec,
  });
  const players = state.games!.games![1]!.players!;
  players[1]!.arrows = { 5: makeArrow({ id: 5 }), 6: makeArrow({ id: 6 }) };
  players[2]!.arrows = { 7: makeArrow({ id: 7 }) };
  return state;
}

function renderGame(spec: Partial<SeatGameSpec> = {}) {
  const webClient = createMockWebClient();
  const utils = renderWithProviders(
    <ShortcutProvider>
      <Game />
    </ShortcutProvider>,
    { preloadedState: seatState(spec), webClient, route: '/game/1' },
  );
  return { ...utils, game: webClient.request.game };
}

function press(code: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true, ...init });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('Game seat shortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Ctrl+R deletes each of the local player\'s arrows once and keeps the page from reloading', () => {
    const { game } = renderGame();

    const event = press('KeyR', { ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(vi.mocked(game.deleteArrow).mock.calls.map(([, params]) => params)).toEqual([
      { arrowId: 5 },
      { arrowId: 6 },
    ]);
  });

  it('Ctrl+L opens the set-life prompt and Ctrl+M the choose-mulligan prompt', () => {
    renderGame();

    press('KeyL', { ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Set life total' })).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(screen.getByRole('dialog', { name: 'Set life total' }), { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: 'Set life total' })).not.toBeInTheDocument();

    press('KeyM', { ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Take mulligan' })).toBeInTheDocument();
  });

  it('on macOS Cmd answers the Ctrl bindings, as Qt maps Ctrl to Cmd', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const { game } = renderGame();

    const event = press('KeyR', { metaKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(vi.mocked(game.deleteArrow).mock.calls.map(([, params]) => params)).toEqual([
      { arrowId: 5 },
      { arrowId: 6 },
    ]);

    press('KeyM', { metaKey: true });
    expect(screen.getByRole('dialog', { name: 'Take mulligan' })).toBeInTheDocument();
  });

  it('off macOS Cmd+R is left to the browser', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const { game } = renderGame();

    const event = press('KeyR', { metaKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(game.deleteArrow).not.toHaveBeenCalled();
  });

  it('a spectator has no seat to act on, so Ctrl+R stays with the browser', () => {
    const { game } = renderGame({ spectator: true, localPlayerId: 3 });

    const event = press('KeyR', { ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(game.deleteArrow).not.toHaveBeenCalled();
  });

  it('a bound "Reveal selected cards to all players" reveals the hand selection in one command', () => {
    const { game, store } = renderGame({
      seats: [
        { playerId: 1, deckCount: 40, hand: [makeCard({ id: 60, name: 'Opt' }), makeCard({ id: 61, name: 'Ponder' })] },
        { playerId: 2, deckCount: 40 },
      ],
    });
    act(() => {
      store.dispatch(shortcuts.Actions.setOverride({ actionId: 'game.revealSelectedToAll', sequences: ['Alt+KeyV'] }));
    });

    press('KeyV', { altKey: true });
    expect(game.revealCards).not.toHaveBeenCalled();

    openContextMenu(cardEl(60, 'hand'));
    chooseMenuPath('Select All');
    press('KeyV', { altKey: true });

    expect(game.revealCards).toHaveBeenCalledTimes(1);
    expect(game.revealCards).toHaveBeenCalledWith(1, { zoneName: 'hand', cardId: [60, 61] });
  });

  // One action per desktop group, from its key to the request it sends.
  describe('the desktop shortcut groups', () => {
    const handSeats = {
      seats: [
        { playerId: 1, deckCount: 40, hand: [makeCard({ id: 60, name: 'Opt' }), makeCard({ id: 61, name: 'Ponder' })] },
        { playerId: 2, deckCount: 40 },
      ],
    };

    it('Move selected card: Ctrl+Delete moves the hand selection to the graveyard in one command', () => {
      const { game } = renderGame(handSeats);
      openContextMenu(cardEl(60, 'hand'));
      chooseMenuPath('Select All');

      const event = press('Delete', { ctrlKey: true });

      expect(event.defaultPrevented).toBe(true);
      expect(vi.mocked(game.moveCard).mock.calls).toEqual([[1, expect.objectContaining({
        startZone: 'hand',
        cardsToMove: { card: [{ cardId: 60 }, { cardId: 61 }] },
        targetZone: 'grave',
      })]]);
    });

    it('Hand: a bound "Reveal hand to all players" reveals the whole hand once; a spectator reveals nothing', () => {
      const bind = (store: ReturnType<typeof renderGame>['store']) => act(() => {
        store.dispatch(shortcuts.Actions.setOverride({ actionId: 'game.revealHandToAll', sequences: ['Alt+KeyV'] }));
      });
      const seated = renderGame(handSeats);
      bind(seated.store);
      press('KeyV', { altKey: true });
      expect(vi.mocked(seated.game.revealCards).mock.calls).toEqual([[1, { zoneName: 'hand' }]]);
      seated.unmount();

      const spectator = renderGame({ ...handSeats, localPlayerId: 3, spectator: true });
      bind(spectator.store);
      const event = press('KeyV', { altKey: true });
      expect(event.defaultPrevented).toBe(false);
      expect(spectator.game.revealCards).not.toHaveBeenCalled();
    });
  });

  // The macros come from the settings store (Settings > Chat).
  const withMacros = (messageMacros: readonly string[]) =>
    vi.mocked(usePreferences).mockReturnValue({ ...PREFERENCE_DEFAULTS, messageMacros });
  afterEach(() => {
    vi.mocked(usePreferences).mockImplementation(() => PREFERENCE_DEFAULTS);
  });

  it('Alt+digit sends the matching message macro verbatim, and nothing without one', () => {
    withMacros(['gg', 'Respond?']);
    const { game } = renderGame();

    press('Digit2', { altKey: true });
    press('Digit3', { altKey: true });

    expect(vi.mocked(game.gameSay).mock.calls).toEqual([[1, { message: 'Respond?' }]]);
  });

  it('a spectator has no Say macros', () => {
    withMacros(['gg']);
    const { game } = renderGame({ localPlayerId: 3, spectator: true });
    press('Digit1', { altKey: true });
    expect(game.gameSay).not.toHaveBeenCalled();
  });

  it('seats install no keydown listener of their own', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderGame();

    // Only the ShortcutProvider and the game-level Escape handler
    // (useGameBoxSelection) listen; neither seat adds one.
    const keydownAdds = add.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownAdds).toHaveLength(2);

    unmount();
    for (const [, listener] of keydownAdds) {
      expect(remove.mock.calls.some(([type, l]) => type === 'keydown' && l === listener)).toBe(true);
    }
  });
});
