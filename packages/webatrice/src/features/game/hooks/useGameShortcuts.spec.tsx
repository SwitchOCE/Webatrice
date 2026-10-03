import { ZoneName } from '@cockatrice/sockatrice';
import { renderHook } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';

import { games, type GamesState } from '@cockatrice/datatrice';
import {
  makeCard,
  makeGameEntry,
  makePlayerEntry,
  makePlayerProperties,
  makeZoneEntry,
} from '@cockatrice/datatrice/testing';
import { CardAttribute } from '@cockatrice/sockatrice/generated';

import { makeReduxWebClientHookWrapper } from '../../../__test-utils__/makeHookWrapper';

interface ShortcutRegistration {
  handler: (event?: KeyboardEvent) => void;
  enabled: boolean;
  scope: unknown;
}

const registrations = new Map<string, ShortcutRegistration>();

vi.mock('@app/feature-widgets/shortcuts', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@app/feature-widgets/shortcuts')
  >();
  return {
    ...actual,
    useShortcut: (
      actionId: string,
      handler: () => void,
      options: { scope: unknown; enabled?: boolean },
    ) => {
      registrations.set(actionId, {
        handler,
        enabled: options.enabled ?? true,
        scope: options.scope,
      });
    },
    useShortcutGroup: (
      actionIds: readonly string[],
      handler: (actionId: string, event: KeyboardEvent) => void,
      options: { scope: unknown; enabled?: boolean },
    ) => {
      for (const actionId of actionIds) {
        registrations.set(actionId, {
          handler: (event?: KeyboardEvent) => handler(actionId, event ?? new KeyboardEvent('keydown')),
          enabled: options.enabled ?? true,
          scope: options.scope,
        });
      }
    },
  };
});

import {
  SEAT_SHORTCUT_ACTIONS,
  createSeatShortcutRegistry,
  type SeatShortcutRegistry,
} from '../components/ui/SeatShortcutsContext';
import { useGameShortcuts } from './useGameShortcuts';

interface SetupOpts {
  started?: boolean;
  spectator?: boolean;
  judge?: boolean;
  activePlayerId?: number;
  conceded?: boolean;
  activePhase?: number;
  tableCards?: ReturnType<typeof makeCard>[];
  seatShortcuts?: SeatShortcutRegistry;
}

function setup(opts: SetupOpts = {}) {
  registrations.clear();
  const {
    started = true,
    spectator = false,
    judge = false,
    activePlayerId = 7,
    conceded = false,
    activePhase = 2,
    tableCards = [],
    seatShortcuts = createSeatShortcutRegistry(),
  } = opts;

  const localPlayerId = 7;
  const game = makeGameEntry({
    localPlayerId,
    started,
    spectator,
    judge,
    activePlayerId,
    activePhase,
    players: {
      [localPlayerId]: makePlayerEntry({
        properties: makePlayerProperties({ playerId: localPlayerId, conceded }),
        zones: {
          [ZoneName.TABLE]: makeZoneEntry({
            name: ZoneName.TABLE,
            cards: tableCards,
            cardCount: tableCards.length,
          }),
          [ZoneName.HAND]: makeZoneEntry({ name: ZoneName.HAND }),
          [ZoneName.DECK]: makeZoneEntry({ name: ZoneName.DECK }),
        },
      }),
    },
  });
  const gamesState: GamesState = {
    games: { 1: { ...game, info: { ...game.info, gameId: 1 } } },
    pings: {},
  };

  const { Wrapper, webClient } = makeReduxWebClientHookWrapper({
    reducer: combineReducers({ games: games.gamesReducer }),
    preloadedState: { games: gamesState },
  });

  const onRequestConcede = vi.fn();
  const onRequestDrawMultiple = vi.fn();
  const onRequestUndoDraw = vi.fn();
  const onRequestRollDie = vi.fn();
  const onRequestLeave = vi.fn();
  const onRequestViewSideboard = vi.fn();
  const onRequestSortHandByType = vi.fn();
  const onRequestViewLibrary = vi.fn();
  const onRequestViewGraveyard = vi.fn();
  const onRequestPlayTop = vi.fn();
  const onRequestMoveTopToGrave = vi.fn();
  const onRequestMoveTopNToGrave = vi.fn();
  const onCloseRecentZoneView = vi.fn(() => false);
  renderHook(() => useGameShortcuts({
    gameId: 1,
    seatShortcuts,
    onRequestConcede,
    onRequestDrawMultiple,
    onRequestUndoDraw,
    onRequestRollDie,
    onRequestLeave,
    onRequestViewSideboard,
    onRequestSortHandByType,
    onRequestViewLibrary,
    onRequestViewGraveyard,
    onRequestPlayTop,
    onRequestMoveTopToGrave,
    onRequestMoveTopNToGrave,
    onCloseRecentZoneView,
  }), {
    wrapper: Wrapper,
  });

  return {
    webClient,
    onRequestConcede,
    onRequestDrawMultiple,
    onRequestUndoDraw,
    onRequestRollDie,
    onRequestLeave,
    onRequestViewSideboard,
    onRequestSortHandByType,
    onRequestViewLibrary,
    onRequestViewGraveyard,
    onRequestPlayTop,
    onRequestMoveTopToGrave,
    onRequestMoveTopNToGrave,
    onCloseRecentZoneView,
  };
}

function fire(actionId: string) {
  const reg = registrations.get(actionId);
  if (!reg) {
    throw new Error(`No registration for ${actionId}`);
  }
  reg.handler();
}

describe('useGameShortcuts', () => {
  it('exposes the GAME-scope shortcut registrations expected by the provider', () => {
    setup();

    expect(registrations.has('game.untapAll')).toBe(true);
    expect(registrations.has('game.drawCard')).toBe(true);
    expect(registrations.has('game.endTurn')).toBe(true);
    expect(registrations.has('game.concede')).toBe(true);
    expect(registrations.has('game.shuffleLibrary')).toBe(true);
    expect(registrations.has('game.nextPhase')).toBe(true);
    expect(registrations.has('game.prevPhase')).toBe(true);
  });

  it('sends a single bulk setCardAttr with cardId -1 for untap-all', () => {
    const tableCards = [
      makeCard({ id: 1, tapped: true }),
      makeCard({ id: 2, tapped: false }),
      makeCard({ id: 3, tapped: true }),
    ];
    const { webClient } = setup({ tableCards });

    fire('game.untapAll');

    expect(webClient.request.game.setCardAttr).toHaveBeenCalledTimes(1);
    expect(webClient.request.game.setCardAttr).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        zone: ZoneName.TABLE,
        cardId: -1,
        attribute: CardAttribute.AttrTapped,
        attrValue: '0',
      }),
    );
  });

  it('draws one card and ends the turn for an active participant', () => {
    const { webClient } = setup();

    fire('game.drawCard');
    fire('game.endTurn');

    expect(webClient.request.game.drawCards).toHaveBeenCalledWith(1, { number: 1 });
    expect(webClient.request.game.nextTurn).toHaveBeenCalledWith(1);
  });

  it('invokes onRequestConcede instead of dispatching a server command', () => {
    const { webClient, onRequestConcede } = setup();

    fire('game.concede');

    expect(onRequestConcede).toHaveBeenCalledTimes(1);
    expect(webClient.request.game.concede).not.toHaveBeenCalled();
  });

  it('advances the active phase modulo PHASE_COUNT (10 wraps to 0)', () => {
    const { webClient } = setup({ activePhase: 10 });

    fire('game.nextPhase');

    expect(webClient.request.game.setActivePhase).toHaveBeenCalledWith(
      1,
      { phase: 0 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('does not draw or pass turn when the local player has conceded', () => {
    const { webClient } = setup({ conceded: true });

    fire('game.drawCard');
    fire('game.endTurn');

    expect(webClient.request.game.drawCards).not.toHaveBeenCalled();
    expect(webClient.request.game.nextTurn).not.toHaveBeenCalled();
  });

  it('locks out spectators from every action-bound shortcut', () => {
    const { webClient, onRequestConcede } = setup({ spectator: true, activePlayerId: 99 });

    fire('game.untapAll');
    fire('game.drawCard');
    fire('game.endTurn');
    fire('game.concede');
    fire('game.shuffleLibrary');
    fire('game.nextPhase');

    expect(webClient.request.game.setCardAttr).not.toHaveBeenCalled();
    expect(webClient.request.game.drawCards).not.toHaveBeenCalled();
    expect(webClient.request.game.nextTurn).not.toHaveBeenCalled();
    expect(webClient.request.game.shuffle).not.toHaveBeenCalled();
    expect(webClient.request.game.setActivePhase).not.toHaveBeenCalled();
    expect(onRequestConcede).not.toHaveBeenCalled();
  });

  describe('seat-scoped shortcuts', () => {
    it('registers every seat action once, for the live game', () => {
      setup();
      for (const actionId of SEAT_SHORTCUT_ACTIONS) {
        expect(registrations.get(actionId)).toMatchObject({ enabled: true });
      }
      expect(SEAT_SHORTCUT_ACTIONS).toEqual(expect.arrayContaining([
        'game.mulligan',
        'game.setLife',
        'game.removeLocalArrows',
      ]));
    });

    it('runs the published seat operation and consumes the key', () => {
      const seatShortcuts = createSeatShortcutRegistry();
      const removeLocalArrows = vi.fn();
      seatShortcuts.publish(() => ({ 'game.removeLocalArrows': removeLocalArrows }));
      setup({ seatShortcuts });

      const event = new KeyboardEvent('keydown', { cancelable: true });
      registrations.get('game.removeLocalArrows')!.handler(event);

      expect(removeLocalArrows).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves the key to the browser when no seat handles it (spectators)', () => {
      setup({ spectator: true });

      const event = new KeyboardEvent('keydown', { cancelable: true });
      registrations.get('game.removeLocalArrows')!.handler(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });
});
