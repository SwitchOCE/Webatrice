import { ZoneName } from '@cockatrice/sockatrice';

import type { SeatSelection } from '../../../hooks/useSeatSelection';
import { selectedHiddenZoneCards } from '../../context-menus/CardContextMenu/handCardMenu.actions';
import { useGameDialogsContext } from '../GameDialogsContext';
import {
  SEAT_SHORTCUT_ACTIONS,
  usePublishSeatShortcuts,
  type SeatShortcutActionId,
  type SeatShortcutOperations,
} from '../SeatShortcutsContext';
import type {
  PlayerCardCommands,
  PlayerCounterCommands,
  PlayerCounterViewModel,
  PlayerTargetCommands,
  PlayerZoneCommands,
} from './playerBoard.types';
import { toRecipient } from './revealRecipient';
import type { BattlefieldCardActions, BattlefieldCardOps } from './useBattlefieldCardOps';
import type { useSeatPrompts } from './useSeatPrompts';

type SeatPrompts = ReturnType<typeof useSeatPrompts>;

/** The part of the seat (usePlayerSeat) the shortcuts act on. */
export interface SeatShortcutSeat {
  seatId: number;
  isSelf: boolean;
  selection: SeatSelection | null;
  /** The game selection, which holds a library / sideboard view's selected cards. */
  selectedCardKeys: ReadonlySet<string>;
  deckCount: number;
  alwaysRevealTopCard: boolean;
  alwaysLookAtTopCard: boolean;
  manaCounters: PlayerCounterViewModel['mana'];
  lastToken: SeatPrompts['lastToken'];
  openLifePrompt: SeatPrompts['openLifePrompt'];
  openCounterPrompt: SeatPrompts['openCounterPrompt'];
  openViewLibraryCountPrompt: SeatPrompts['openViewLibraryCountPrompt'];
  openCreateTokenDialog: SeatPrompts['openCreateTokenDialog'];
  openMoveTopUntilDialog: () => void;
  cardOps: BattlefieldCardActions;
  zoneCommands: PlayerZoneCommands;
  cardCommands: PlayerCardCommands;
  counterCommands: PlayerCounterCommands;
  targetCommands: PlayerTargetCommands;
}

type SeatShortcut = (seat: SeatShortcutSeat & { requestMulligan: () => void }) => void;

/** A battlefield action on the selection (desktop runs these on the scene's
 *  selected cards); nothing without a battlefield selection. */
const onSelection = (op: (ops: BattlefieldCardOps) => void): SeatShortcut => ({ cardOps }) => {
  const ops = cardOps.forSelection();
  if (ops) {
    op(ops);
  }
};

/** The Storm ("Other") player counter, once the seat has it. */
const onStorm = (op: (seat: SeatShortcutSeat, storm: { id: number; count: number }) => void): SeatShortcut => (seat) => {
  if (seat.manaCounters?.O) {
    op(seat, seat.manaCounters.O);
  }
};

/** A library action, while the library has cards. */
const onLibrary = (op: SeatShortcut): SeatShortcut => (seat) => {
  if (seat.deckCount > 0) {
    op(seat);
  }
};

/**
 * Desktop's player shortcuts, by action id. Each one calls an existing seat
 * op, prompt or port; the selection-scoped ones go through the same
 * battlefield card ops as the card menu. No entry checks isSelf: only the
 * local seat publishes its shortcuts (usePublishSeatShortcuts below).
 */
const SEAT_SHORTCUTS: Record<SeatShortcutActionId, SeatShortcut> = {
  // aMulligan (Ctrl+M) asks for the hand size rather than assuming seven.
  'game.mulligan': (seat) => seat.requestMulligan(),
  'game.setLife': (seat) => seat.openLifePrompt(),
  // aRemoveLocalArrows (Ctrl+R): only the arrows this player drew.
  'game.removeLocalArrows': (seat) => seat.targetCommands.clearOwnArrows(),
  'game.doesntUntap': onSelection((ops) => ops.toggleDoesntUntap()),
  'game.moveTopUntil': onLibrary((seat) => seat.openMoveTopUntilDialog()),
  'game.alwaysRevealTopCard': (seat) => seat.zoneCommands.setAlwaysRevealTopCard(!seat.alwaysRevealTopCard),
  'game.alwaysLookAtTopCard': (seat) => seat.zoneCommands.setAlwaysLookAtTopCard(!seat.alwaysLookAtTopCard),
  'game.viewTopCards': onLibrary((seat) => seat.openViewLibraryCountPrompt({ isReversed: false, deckSize: seat.deckCount })),
  'game.viewBottomCards': onLibrary((seat) => seat.openViewLibraryCountPrompt({ isReversed: true, deckSize: seat.deckCount })),
  'game.createToken': (seat) => seat.openCreateTokenDialog(),
  // Re-creates the last token submitted from the dialog.
  'game.createAnotherToken': (seat) => {
    if (seat.lastToken) {
      seat.cardCommands.createToken(seat.lastToken);
    }
  },
  'game.drawArrow': onSelection((ops) => ops.drawArrow()),
  'game.resetPT': onSelection((ops) => ops.resetPT()),
  'game.reduceLifeByPower': onSelection((ops) => ops.reduceLifeByPower()),
  'game.addStormCounter': onStorm((seat, storm) => seat.counterCommands.increment(storm.id, 1)),
  'game.removeStormCounter': onStorm((seat, storm) => seat.counterCommands.increment(storm.id, -1)),
  'game.setStormCounter': onStorm((seat, storm) =>
    seat.openCounterPrompt({ counterId: storm.id, label: 'Other', currentValue: storm.count })),
  'game.attachCard': onSelection((ops) => ops.attach()),
  'game.peekCard': onSelection((ops) => ops.peek()),
  'game.flipCard': onSelection((ops) => ops.toggleFaceDown()),
  'game.unattachCard': onSelection((ops) => ops.unattach()),
  'game.moveSelectedToGrave': onSelection((ops) => ops.move({ zone: ZoneName.GRAVE })),
  'game.setCardPT': onSelection((ops) => ops.promptPT()),
  'game.incP': onSelection((ops) => ops.changePT(1, 0)),
  'game.decP': onSelection((ops) => ops.changePT(-1, 0)),
  'game.incT': onSelection((ops) => ops.changePT(0, 1)),
  'game.decT': onSelection((ops) => ops.changePT(0, -1)),
  'game.incPT': onSelection((ops) => ops.changePT(1, 1)),
  'game.decPT': onSelection((ops) => ops.changePT(-1, -1)),
  // Desktop selects under the pointer's zone; the seat selects its own battlefield.
  'game.selectAllBattlefield': (seat) => seat.cardOps.selectAll(),
  'game.selectRowBattlefield': onSelection((ops) => ops.selectRow()),
  'game.selectColumnBattlefield': onSelection((ops) => ops.selectColumn()),
  // Desktop's default card counters: A (red, 0), B (yellow, 1), C (green, 2).
  'game.addCounterA': onSelection((ops) => ops.stepCounter(0, 1)),
  'game.removeCounterA': onSelection((ops) => ops.stepCounter(0, -1)),
  'game.setCounterA': onSelection((ops) => ops.promptCounter(0)),
  'game.addCounterB': onSelection((ops) => ops.stepCounter(1, 1)),
  'game.removeCounterB': onSelection((ops) => ops.stepCounter(1, -1)),
  'game.setCounterB': onSelection((ops) => ops.promptCounter(1)),
  'game.addCounterC': onSelection((ops) => ops.stepCounter(2, 1)),
  'game.removeCounterC': onSelection((ops) => ops.stepCounter(2, -1)),
  'game.setCounterC': onSelection((ops) => ops.promptCounter(2)),
  'game.incrementAllCardCounters': (seat) => seat.cardOps.incrementAllCounters(),
  'game.setAnnotation': onSelection((ops) => ops.promptAnnotation()),
  'game.moveSelectedToLibraryBottom': onSelection((ops) => ops.move({ zone: ZoneName.DECK, reversed: true })),
  'game.cloneCard': onSelection((ops) => ops.clone()),
  // aRevealToAll: one Command_RevealCards without player_id for the selected
  // cards of one hidden zone of this seat (the hand, or an open library /
  // sideboard view).
  'game.revealSelectedToAll': (seat) => {
    const picked = selectedHiddenZoneCards(seat.seatId, seat.selection, seat.selectedCardKeys);
    if (picked) {
      seat.zoneCommands.reveal(picked.zone, toRecipient(-1), { cardIds: picked.cardIds });
    }
  },
};

/**
 * Publishes the seat's keyboard actions (desktop's player shortcuts) through
 * SeatShortcutsContext. useGameShortcuts owns the key bindings and runs them
 * for the local seat only, so only the local seat publishes.
 */
export function useSeatShortcutOperations(seat: SeatShortcutSeat): void {
  const { handleRequestChooseMulligan } = useGameDialogsContext();
  const context = { ...seat, requestMulligan: handleRequestChooseMulligan };
  const operations: SeatShortcutOperations = Object.fromEntries(
    SEAT_SHORTCUT_ACTIONS.map((id) => [id, () => SEAT_SHORTCUTS[id](context)]),
  );
  usePublishSeatShortcuts(seat.isSelf ? operations : null);
}
