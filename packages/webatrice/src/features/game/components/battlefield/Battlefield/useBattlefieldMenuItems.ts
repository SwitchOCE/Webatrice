import type { ActionId, useShortcutHints } from '@app/feature-widgets/shortcuts';

import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { MANA_COLORS } from '../../right-sidebar/PlayerInfoPanel/manaColors';
import { useMessageMacros } from '../../../hooks/useMessageMacros';
import { useTallyType } from '../../../hooks/useTallyType';
import { useGameDialogActions } from '../../ui/GameDialogActionsContext';
import { useGameDialogsContext } from '../../ui/GameDialogsContext';
import type {
  BattlefieldCardViewModel,
  PlayerCardCommands,
  PlayerCounterCommands,
  PlayerCounterViewModel,
} from '../../ui/PlayerBoard/playerBoard.types';
import type { LifeControl, useSeatPrompts } from '../../ui/PlayerBoard/useSeatPrompts';
import { buildCustomZonesMenu } from './customZonesMenu';
import { buildSayMenu } from './sayMenu';
import { buildTallyMenu } from './tallyMenu';

type ShortcutHints = ReturnType<typeof useShortcutHints>;
type SeatPrompts = ReturnType<typeof useSeatPrompts>;

export interface UseBattlefieldMenuItemsArgs {
  seatId: number;
  /** Zones beyond the seven builtins (desktop custom zones), listed for viewing after Sideboard. */
  customZones: readonly { name: string }[];
  /** Sends a message macro to the game chat; set for the local seat only. */
  onSay: ((message: string) => void) | undefined;
  handMenuItems: ContextMenuItem[];
  libraryMenuItems: ContextMenuItem[];
  graveMenuItemsSelf: ContextMenuItem[];
  graveMenuItemsOpponent: ContextMenuItem[];
  exileMenuItemsSelf: ContextMenuItem[];
  exileMenuItemsOpponent: ContextMenuItem[];
  lifeControl: LifeControl | undefined;
  openLifePrompt: () => void;
  openCounterPrompt: SeatPrompts['openCounterPrompt'];
  manaCounters: PlayerCounterViewModel['mana'];
  /** "Increment all card counters": the seat's card op (useBattlefieldCardOps). */
  incrementAllCardCounters: () => void;
  battlefieldDisplayList: readonly BattlefieldCardViewModel[];
  lastToken: SeatPrompts['lastToken'];
  openCreateTokenDialog: () => void;
  shortcutHints: ShortcutHints;
  cardCommands: PlayerCardCommands;
  counterCommands: PlayerCounterCommands;
}

/**
 * The battlefield's right-click menus. The owner gets desktop's PlayerMenu
 * (player_menu.cpp:60-62): the hand, library, graveyard, exile and sideboard
 * menus as submenus, the player counters, card-counter and untap utilities,
 * dice, tokens, game info and Tally. Every other viewer gets only the
 * graveyard and exile views and Tally, as desktop gates the rest behind the
 * local player.
 */
export function useBattlefieldMenuItems({
  seatId,
  customZones,
  onSay,
  handMenuItems,
  libraryMenuItems,
  graveMenuItemsSelf,
  graveMenuItemsOpponent,
  exileMenuItemsSelf,
  exileMenuItemsOpponent,
  lifeControl,
  openLifePrompt,
  openCounterPrompt,
  manaCounters,
  incrementAllCardCounters,
  battlefieldDisplayList,
  lastToken,
  openCreateTokenDialog,
  shortcutHints,
  cardCommands,
  counterCommands,
}: UseBattlefieldMenuItemsArgs) {
  const { onRequestRollDie, onRequestGameInfo, onRequestViewSideboard } = useGameDialogActions();
  const { openZoneView } = useGameDialogsContext();
  // Every player's menu ends with Tally (player_menu.cpp:48), a local choice
  // the game overlays on the selection.
  const [tallyType, setTallyType] = useTallyType();
  const tallyMenu = buildTallyMenu(tallyType, setTallyType);
  // The own menu ends with Say (player_menu.cpp:54), the message macros.
  const messageMacros = useMessageMacros();

  // Counters submenu — Cockatrice's AbstractCounter builds a menu per
  // counter with "Set counter..." + ±1..±10 rows (abstract_counter.cpp:36-57).
  // We already have all the wires for these: `lifeControl.onDelta` /
  // `.onSet` for life, and `counterCommands.increment(id, delta)` for the mana
  // pool. Just build the delta list programmatically and hand it to
  // each counter's submenu. "Set counter..." on Life reuses the
  // existing Ctrl+L modal; mana counters don't have a set-modal yet
  // so their Set row is disabled.
  // The +1 / -1 rows show the counter's add / remove shortcut.
  const buildDeltaItems = (
    apply: (delta: number) => void,
    hints: { inc: string; dec: string },
  ): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    // +10 down to +1
    for (let i = 10; i >= 1; i--) {
      items.push({ label: `+${i}`, onClick: () => apply(i), shortcut: i === 1 ? hints.inc : undefined });
    }
    items.push({ divider: true });
    // -1 down to -10
    for (let i = 1; i <= 10; i++) {
      items.push({ label: `-${i}`, onClick: () => apply(-i), shortcut: i === 1 ? hints.dec : undefined });
    }
    return items;
  };
  // Each counter's [add, remove, set] shortcuts: desktop's aInc / aDec / aSet
  // for life, aIncCounter_* / aDecCounter_* / aSetCounter_* for the pool.
  const counterHints = (inc: ActionId, dec: ActionId, set: ActionId) => ({
    inc: shortcutHints[inc],
    dec: shortcutHints[dec],
    set: shortcutHints[set],
  });
  const manaHints: Record<(typeof MANA_COLORS)[number]['symbol'], ReturnType<typeof counterHints>> = {
    W: counterHints('game.incManaCounterW', 'game.decManaCounterW', 'game.setManaCounterW'),
    U: counterHints('game.incManaCounterU', 'game.decManaCounterU', 'game.setManaCounterU'),
    B: counterHints('game.incManaCounterB', 'game.decManaCounterB', 'game.setManaCounterB'),
    R: counterHints('game.incManaCounterR', 'game.decManaCounterR', 'game.setManaCounterR'),
    G: counterHints('game.incManaCounterG', 'game.decManaCounterG', 'game.setManaCounterG'),
    C: counterHints('game.incManaCounterX', 'game.decManaCounterX', 'game.setManaCounterX'),
    O: counterHints('game.addStormCounter', 'game.removeStormCounter', 'game.setStormCounter'),
  };
  const lifeHints = counterHints('game.incLife', 'game.decLife', 'game.setLife');
  const lifeCounterItems: ContextMenuItem[] = [
    {
      label: 'Set counter...',
      onClick: () => openLifePrompt(),
      disabled: !lifeControl,
      shortcut: lifeHints.set,
    },
    { divider: true },
    ...buildDeltaItems((d) => lifeControl?.onDelta(d), lifeHints),
  ];
  const manaCounterSubmenus: ContextMenuItem[] = MANA_COLORS.map((m) => {
    const counter = manaCounters?.[m.symbol];
    const canModify = counter != null;
    const canSet = counter != null;
    return {
      label: m.label,
      // Disable the whole counter's submenu when we don't have a
      // counter id from Redux (pre-hydration transient) — every row
      // inside would no-op anyway.
      disabled: !canModify,
      submenu: [
        {
          // The same sum prompt Ctrl+L opens, titled with the
          // counter name. Fires Command_SetCounter with the
          // absolute value.
          label: 'Set counter...',
          onClick: () => {
            if (counter) {
              openCounterPrompt({
                counterId: counter.id,
                label: m.label,
                currentValue: counter.count,
              });
            }
          },
          disabled: !canSet,
          shortcut: manaHints[m.symbol].set,
        },
        { divider: true },
        ...buildDeltaItems((d) => {
          if (canModify) {
            counterCommands.increment(counter.id, d);
          }
        }, manaHints[m.symbol]),
      ],
    };
  });
  const countersMenuItems: ContextMenuItem[] = [
    { label: 'Life', submenu: lifeCounterItems },
    ...manaCounterSubmenus,
  ];

  // Rest of the battlefield menu — pile submenus are placeholders
  // (already wired on the piles themselves), utility items wire
  // Roll die and Game info via GameDialogActionsContext. Everything
  // else stays disabled with the correct label so the menu reads
  // identical in shape to Cockatrice's PlayerMenu.
  const battlefieldMenuItems: ContextMenuItem[] = [
    {
      label: 'Hand',
      submenu: handMenuItems,
    },
    {
      // Same items as right-clicking the library pile. Cockatrice's
      // PlayerMenu attaches the same LibraryMenu to both places
      // (player_menu.cpp:23,67).
      label: 'Library',
      submenu: libraryMenuItems,
    },
    {
      // Same items as right-clicking the graveyard pile. Cockatrice's
      // PlayerMenu attaches the same GraveyardMenu to both places
      // (player_menu.cpp:29,63). Top-level entry stays enabled even
      // when the pile is empty so the user can still open "View
      // graveyard" — individual submenu items handle their own
      // per-pile-count disabling.
      label: 'Graveyard',
      submenu: graveMenuItemsSelf,
    },
    {
      // Same items as right-clicking the exile pile. Cockatrice's
      // PlayerMenu attaches the same RfgMenu to both places
      // (player_menu.cpp:30,64).
      label: 'Exile',
      submenu: exileMenuItemsSelf,
    },
    {
      label: 'Sideboard',
      submenu: [
        {
          // Cockatrice's actViewSideboard opens the same zone-view
          // dialog that "View library" opens (player_actions.cpp:232-234).
          label: 'View sideboard',
          onClick: onRequestViewSideboard,
          shortcut: shortcutHints['game.viewSideboard'],
        },
      ],
    },
    ...buildCustomZonesMenu(customZones, (zoneName) => openZoneView({ playerId: seatId, zoneName })),
    { divider: true },
    {
      // Counters submenu — Cockatrice's countersMenu lists every
      // per-player counter (life + w/u/b/r/g/x/storm) as its own
      // ±N/Set submenu (AbstractCounter, abstract_counter.cpp:36-57).
      // We already wire the deltas via lifeControl.onDelta and
      // counterCommands.increment, and life's Set via the Ctrl+L modal.
      label: 'Counters',
      submenu: countersMenuItems,
    },
    {
      // "Increment all card counters" — desktop actIncrementAllCardCounters
      // (player_actions.cpp:1588-1621), on the selection or the whole
      // battlefield. Disabled while the battlefield is empty.
      label: 'Increment all card counters',
      shortcut: shortcutHints['game.incrementAllCardCounters'],
      onClick: incrementAllCardCounters,
      disabled:
        battlefieldDisplayList.length === 0,
    },
    { divider: true },
    {
      // "Untap all permanents" — port of Cockatrice's actUntapAll.
      // Fires one Command_SetCardAttr with cardId=-1 (Servatrice's
      // "all cards in zone" sentinel), which the server iterates
      // over every card in TABLE and untaps each while respecting
      // per-card `doesntUntap` flags (server_card.cpp:70). This is
      // the same wire the phase-tracker's untap-step double-click
      // fires (usePhaseBar.ts:41-51) — one wire, whole battlefield.
      // Not phase-gated here — the menu action is always available.
      label: 'Untap all permanents',
      onClick: () => cardCommands.untapAll(),
      shortcut: shortcutHints['game.untapAll'],
    },
    { divider: true },
    {
      label: 'Roll die...',
      onClick: () => onRequestRollDie?.(),
      shortcut: shortcutHints['game.rollDice'],
    },
    {
      // "Flip coin" — port of actFlipCoin (player_actions.cpp:866-872).
      // Cockatrice models a coin flip as a `Command_RollDie(sides=2,
      // count=1)`; server broadcasts Event_RollDie and the chat log
      // renders the heads/tails outcome.
      label: 'Flip coin',
      onClick: () => counterCommands.flipCoin(),
      shortcut: shortcutHints['game.flipCoin'],
    },
    { divider: true },
    {
      // "Create token..." — opens the modal, on submit fires
      // Command_CreateToken and snapshots the payload into lastToken
      // so "Create another token" can re-fire without the modal.
      // Matches Cockatrice's actCreateToken (player_actions.cpp:878-892):
      // stores lastTokenInfo, then chains into actCreateAnotherToken.
      label: 'Create token...',
      onClick: () => openCreateTokenDialog(),
      shortcut: shortcutHints['game.createToken'],
    },
    {
      // "Create another token" — direct re-fire with the last submitted
      // args. Mirrors Cockatrice's actCreateAnotherToken which early-
      // returns when lastTokenInfo.name is empty (player_actions.cpp:895);
      // we disable the menu item instead so the state matches Cockatrice's
      // "enable" signal (requestEnableAndSetCreateAnotherTokenAction).
      label: 'Create another token',
      onClick: () => {
        if (lastToken) {
          cardCommands.createToken(lastToken);
        }
      },
      disabled: !lastToken,
      shortcut: shortcutHints['game.createAnotherToken'],
    },
    {
      label: 'Create predefined token',
      // Populated at runtime from the deck's tokens zone in Cockatrice.
      disabled: true,
    },
    { divider: true },
    {
      label: 'Game info...',
      onClick: () => onRequestGameInfo?.(),
    },
    tallyMenu,
    ...(onSay ? [buildSayMenu(messageMacros, shortcutHints, onSay)] : []),
  ];

  // Opponent battlefield right-click menu. Ports Cockatrice's
  // player_menu.cpp:14-58 opponent branch: all utility items (Create
  // token, Roll die, Counters, Untap all, Hand / Library / Sideboard
  // submenus) are OWN-ONLY, so the opponent menu narrows to just the
  // two public zones you can peek at — graveyard and exile — plus the
  // menus every player's menu carries (Tally, player_menu.cpp:48). Reuses
  // the same opponent grave/exile item arrays the pile-level menus
  // already attach so "View graveyard" opens the same LibrarySearch
  // dialog either way.
  const opponentBattlefieldMenuItems: ContextMenuItem[] = [
    { label: 'Graveyard', submenu: graveMenuItemsOpponent },
    { label: 'Exile', submenu: exileMenuItemsOpponent },
    tallyMenu,
  ];

  return {
    battlefieldMenuItems,
    opponentBattlefieldMenuItems,
  };
}
