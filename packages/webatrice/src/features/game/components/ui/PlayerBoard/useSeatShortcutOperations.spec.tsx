import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ZoneName } from '@cockatrice/sockatrice';

import { NOOP_GAME_DIALOGS_ACTIONS, type GameDialogs } from '../../../hooks/dialogs/gameDialogs.types';
import type { SeatSelection } from '../../../hooks/useSeatSelection';
import { makeCardKey } from '../../../utils/CardRegistry/CardRegistryContext';
import { GameDialogsProvider } from '../GameDialogsContext';
import { SEAT_SHORTCUT_ACTIONS, SeatShortcutsProvider, createSeatShortcutRegistry } from '../SeatShortcutsContext';
import type {
  BattlefieldCardViewModel,
  CreateTokenRequest,
  PlayerCardCommands,
  PlayerCounterCommands,
  PlayerCounterViewModel,
  PlayerTargetCommands,
  PlayerZoneCommands,
} from './playerBoard.types';
import { useBattlefieldCardOps } from './useBattlefieldCardOps';
import { useSeatShortcutOperations } from './useSeatShortcutOperations';
import type { LifeControl } from './useSeatPrompts';

const bf = (id: number, extra: Partial<BattlefieldCardViewModel> = {}): BattlefieldCardViewModel => ({
  id: String(id),
  name: `Card ${id}`,
  scryfallId: `p${id}`,
  slot: { row: 0, col: id },
  subSlot: 0,
  tapped: false,
  ...extra,
});

const BOARD = [
  bf(10, { pt: '3/3', counters: [{ id: 0, value: 2 }] }),
  bf(11, { faceDown: true, slot: { row: 0, col: 5 } }),
  bf(12, { slot: { row: 2, col: 0 } }),
];

/** A command port whose every method is a spy. */
function ports<T extends object>(): T {
  const spies = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
  return new Proxy({} as T, {
    get: (_target, key) => {
      if (!spies.has(key)) {
        spies.set(key, vi.fn());
      }
      return spies.get(key);
    },
  });
}

const selected = (...ids: number[]): SeatSelection => ({ zone: 'battlefield', ids: new Set(ids.map(String)) });

interface SetupArgs {
  isSelf?: boolean;
  selection?: SeatSelection | null;
  selectedCardKeys?: ReadonlySet<string>;
  deckCount?: number;
  manaCounters?: PlayerCounterViewModel['mana'];
  lastToken?: CreateTokenRequest | null;
}

/** The seat's shortcuts over the real battlefield card ops and spy ports. */
function setup({
  isSelf = true,
  selection = null,
  selectedCardKeys = new Set(),
  deckCount = 30,
  manaCounters = { O: { id: 7, count: 0 } },
  lastToken = null,
}: SetupArgs = {}) {
  const registry = createSeatShortcutRegistry();
  const dialogs = { ...NOOP_GAME_DIALOGS_ACTIONS, handleRequestChooseMulligan: vi.fn() };
  const zoneCommands = ports<PlayerZoneCommands>();
  const cardCommands = ports<PlayerCardCommands>();
  const counterCommands = ports<PlayerCounterCommands>();
  const targetCommands = ports<PlayerTargetCommands>();
  const lifeControl: LifeControl = { value: 20, onDelta: vi.fn(), onSet: vi.fn() };
  const props = {
    setSelection: vi.fn(),
    lifeControl,
    openLifePrompt: vi.fn(),
    openCounterPrompt: vi.fn(),
    openViewLibraryCountPrompt: vi.fn(),
    openCreateTokenDialog: vi.fn(),
    openMoveTopUntilDialog: vi.fn(),
    openPTPrompt: vi.fn(),
    startAttach: vi.fn(),
    startArrow: vi.fn(),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GameDialogsProvider value={dialogs as unknown as GameDialogs}>
      <SeatShortcutsProvider registry={registry}>{children}</SeatShortcutsProvider>
    </GameDialogsProvider>
  );
  renderHook(() => {
    const cardOps = useBattlefieldCardOps({
      cards: BOARD,
      selection,
      setSelection: props.setSelection,
      cardMetaByName: new Map([['Card 12', { typeLine: 'Creature', pt: '1/1' }]]),
      deckCount,
      lifeControl,
      cardCommands,
      counterCommands,
      targetCommands,
      zoneCommands,
      prompts: {
        openAnnotationPrompt: vi.fn(),
        openPTPrompt: props.openPTPrompt,
        openCardCounterPrompt: vi.fn(),
        openMoveXFromTopPrompt: vi.fn(),
      },
      startAttach: props.startAttach,
      startArrow: props.startArrow,
    });
    useSeatShortcutOperations({
      seatId: 1,
      isSelf,
      selection,
      selectedCardKeys,
      deckCount,
      alwaysRevealTopCard: false,
      alwaysLookAtTopCard: false,
      manaCounters,
      lastToken,
      openLifePrompt: props.openLifePrompt,
      openCounterPrompt: props.openCounterPrompt,
      openViewLibraryCountPrompt: props.openViewLibraryCountPrompt,
      openCreateTokenDialog: props.openCreateTokenDialog,
      openMoveTopUntilDialog: props.openMoveTopUntilDialog,
      cardOps,
      zoneCommands,
      cardCommands,
      counterCommands,
      targetCommands,
    });
  }, { wrapper });
  return { run: registry.run, props, dialogs, zoneCommands, cardCommands, counterCommands, targetCommands };
}

describe('useSeatShortcutOperations', () => {
  it('publishes every seat action for the local seat, and none for another seat', () => {
    const { run } = setup();
    expect(SEAT_SHORTCUT_ACTIONS.filter((id) => !run(id))).toEqual([]);
    const other = setup({ isSelf: false });
    expect(SEAT_SHORTCUT_ACTIONS.some((id) => other.run(id))).toBe(false);
  });

  it('reveals the selected hand or library-view cards to every player', () => {
    const hand = setup({ selection: { zone: 'hand', ids: new Set(['4', '9']) } });
    hand.run('game.revealSelectedToAll');
    expect(vi.mocked(hand.zoneCommands.reveal).mock.calls).toEqual([[ZoneName.HAND, 'all', { cardIds: [4, 9] }]]);

    const view = setup({ selectedCardKeys: new Set([makeCardKey(1, ZoneName.DECK, 11), makeCardKey(1, ZoneName.DECK, 12)]) });
    view.run('game.revealSelectedToAll');
    expect(vi.mocked(view.zoneCommands.reveal).mock.calls).toEqual([[ZoneName.DECK, 'all', { cardIds: [11, 12] }]]);

    // Another seat's view, or a mixed selection, reveals nothing.
    const other = setup({ selectedCardKeys: new Set([makeCardKey(2, ZoneName.DECK, 11)]) });
    other.run('game.revealSelectedToAll');
    const mixed = setup({ selectedCardKeys: new Set([makeCardKey(1, ZoneName.DECK, 11), makeCardKey(1, ZoneName.GRAVE, 3)]) });
    mixed.run('game.revealSelectedToAll');
    expect(other.zoneCommands.reveal).not.toHaveBeenCalled();
    expect(mixed.zoneCommands.reveal).not.toHaveBeenCalled();
  });

  it('runs the player-level actions', () => {
    const { run, props, dialogs, targetCommands, counterCommands, zoneCommands } = setup();
    run('game.mulligan');
    run('game.setLife');
    run('game.removeLocalArrows');
    run('game.addStormCounter');
    run('game.alwaysRevealTopCard');
    run('game.viewBottomCards');
    expect(dialogs.handleRequestChooseMulligan).toHaveBeenCalled();
    expect(props.openLifePrompt).toHaveBeenCalled();
    expect(targetCommands.clearOwnArrows).toHaveBeenCalled();
    expect(counterCommands.increment).toHaveBeenCalledWith(7, 1);
    expect(zoneCommands.setAlwaysRevealTopCard).toHaveBeenCalledWith(true);
    expect(props.openViewLibraryCountPrompt).toHaveBeenCalledWith({ isReversed: true, deckSize: 30 });
  });

  it('does nothing selection-scoped without a battlefield selection', () => {
    const { run, cardCommands, zoneCommands } = setup({ selection: { zone: 'hand', ids: new Set(['10']) } });
    run('game.flipCard');
    run('game.moveSelectedToGrave');
    expect(cardCommands.flip).not.toHaveBeenCalled();
    expect(zoneCommands.moveCards).not.toHaveBeenCalled();
  });

  it('acts on the battlefield selection, driving toggles from the first selected card', () => {
    const { run, cardCommands, zoneCommands } = setup({ selection: selected(10, 11) });
    run('game.flipCard');
    expect(vi.mocked(cardCommands.flip).mock.calls).toEqual([[10, true], [11, true]]);
    run('game.peekCard');
    expect(cardCommands.peek).toHaveBeenCalledWith([11]);
    run('game.moveSelectedToGrave');
    expect(zoneCommands.moveCards).toHaveBeenCalledWith(ZoneName.TABLE, [10, 11], { zone: ZoneName.GRAVE, reversed: false });
  });

  it('changes P/T from each card\'s own value, and resets to the printed base', () => {
    const { run, cardCommands } = setup({ selection: selected(10, 12) });
    run('game.incPT');
    expect(cardCommands.setPT).toHaveBeenLastCalledWith([{ cardId: 10, pt: '4/4' }, { cardId: 12, pt: '2/2' }]);
    run('game.resetPT');
    expect(cardCommands.setPT).toHaveBeenLastCalledWith([{ cardId: 10, pt: '' }, { cardId: 12, pt: '1/1' }]);
  });

  it('adds card counters in one batch and reduces life by the selection\'s power', () => {
    const { run, counterCommands, props } = setup({ selection: selected(10, 12) });
    run('game.addCounterA');
    expect(counterCommands.setCardCounters).toHaveBeenCalledWith([
      { cardId: 10, counterId: 0, value: 3 },
      { cardId: 12, counterId: 0, value: 1 },
    ]);
    run('game.reduceLifeByPower');
    expect(props.lifeControl.onDelta).toHaveBeenCalledWith(-3);
  });

  it('selects a row or column from the first selected card', () => {
    const { run, props } = setup({ selection: selected(10) });
    run('game.selectRowBattlefield');
    expect(props.setSelection).toHaveBeenLastCalledWith(selected(10, 11));
    run('game.selectAllBattlefield');
    expect(props.setSelection).toHaveBeenLastCalledWith(selected(10, 11, 12));
  });

  it('starts the attach and draw-arrow picks from the selection', () => {
    const { run, props } = setup({ selection: selected(10, 11) });
    run('game.attachCard');
    expect(props.startAttach).toHaveBeenCalledWith([10, 11], 'Card 10');
    run('game.drawArrow');
    expect(props.startArrow).toHaveBeenCalledWith(10, 'Card 10');
  });

  it('runs the library and token actions only when they have something to act on', () => {
    const empty = setup({ deckCount: 0, manaCounters: {}, lastToken: null });
    (['game.moveTopUntil', 'game.viewTopCards', 'game.addStormCounter', 'game.setStormCounter', 'game.createAnotherToken'] as const)
      .forEach((id) => empty.run(id));
    expect(empty.props.openMoveTopUntilDialog).not.toHaveBeenCalled();
    expect(empty.props.openViewLibraryCountPrompt).not.toHaveBeenCalled();
    expect(empty.counterCommands.increment).not.toHaveBeenCalled();
    expect(empty.props.openCounterPrompt).not.toHaveBeenCalled();
    expect(empty.cardCommands.createToken).not.toHaveBeenCalled();

    const token = { name: 'Soldier', color: 'w', pt: '1/1', annotation: '', destroyOnZoneChange: true, faceDown: false };
    const full = setup({ lastToken: token });
    full.run('game.moveTopUntil');
    full.run('game.setStormCounter');
    full.run('game.createAnotherToken');
    expect(full.props.openMoveTopUntilDialog).toHaveBeenCalled();
    expect(full.props.openCounterPrompt).toHaveBeenCalledWith({ counterId: 7, label: 'GameLog.counter.other', currentValue: 0 });
    expect(full.cardCommands.createToken).toHaveBeenCalledWith(token);
  });

  it('opens the P/T prompt on the selection, prefilled from its first card', () => {
    const { run, props } = setup({ selection: selected(12, 10) });
    run('game.setCardPT');
    expect(props.openPTPrompt).toHaveBeenCalledWith({ targetIds: [10, 12], cardName: 'Card 10', current: '3/3' });
  });
});
