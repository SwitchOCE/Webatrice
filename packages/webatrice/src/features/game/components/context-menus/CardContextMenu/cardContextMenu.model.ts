// The battlefield card context menu as data (refactor plan PB-09). Labels,
// order, dividers and shortcut hints mirror desktop's card menu
// (menu_builder.cpp / TableZone::onCardContextMenu); the builder only wires
// the caller's handlers, so it never touches a client or Dexie. The seat builds
// it and ContextMenuEntries draws it on the shared Menu.

import type { ActionId } from '@app/feature-widgets/shortcuts';

import { counterColorForId } from '../../ui/SeatCard/counterColors';
import type { ContextMenuItem, MenuShortcutFor } from '../ContextMenu/ContextMenu';

export interface BuildCardContextMenuArgs {
  /** Each item's shortcut props from the current bindings (useMenuShortcut), so the
   *  hints follow a rebinding in the Shortcuts tab. */
  menuShortcut: MenuShortcutFor;
  faceDown: boolean;
  doesntUntap: boolean;
  onTapUntap: () => void;
  onFlip: () => void;
  /** "Peek card" — Cockatrice's `aPeek`. Menu item only appears when
   *  `faceDown` is true. Fires one `Command_RevealCards` per selected
   *  card, revealed to the local player only. */
  onPeek: () => void;
  onSkipUntapping: () => void;
  onClone: () => void;
  onSetAnnotation: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
  onMoveToTable: () => void;
  onMoveToHand: () => void;
  onMoveToGrave: () => void;
  onMoveToExile: () => void;
  /** "X cards from the top of library..." — opens a numeric prompt and
   *  moves the source card N positions from the top of its owner's
   *  library on submit. Ports Cockatrice's
   *  `actRequestMoveCardXCardsFromTopDialog` (player_actions.cpp:1220). */
  onMoveToXCardsFromTop: () => void;
  /** P/T submenu handlers. Each mirrors one entry in Cockatrice's
   *  `pt_menu.cpp`. Order: increase power / decrease power / flow P
   *  (P+1, T-1); increase toughness / decrease toughness / flow T
   *  (P-1, T+1); increase both / decrease both; set..., reset. */
  onIncP: () => void;
  onDecP: () => void;
  onFlowP: () => void;
  onIncT: () => void;
  onDecT: () => void;
  onFlowT: () => void;
  onIncPT: () => void;
  onDecPT: () => void;
  onSetPT: () => void;
  onResetPT: () => void;
  /** "Attach to card..." — enters pending-attach mode. The next click on
   *  a battlefield card resolves the attach; Escape or clicking the
   *  source card cancels. Ported behavior from Cockatrice's `actAttach`
   *  (player_actions.cpp:1493-1501). */
  onAttachToCard: () => void;
  /** Gates the "Unattach" menu item. True when the target card is
   *  currently attached to another card (has a valid `attachTargetCardId`).
   *  Cockatrice hides the item entirely when nothing is attached. */
  isAttached: boolean;
  /** "Unattach" — sends `Command_AttachCard` with no target so the
   *  server clears this card's `attachedTo` link. Ports
   *  `PlayerActions::actUnattach` (player_actions.cpp:1503-1517). */
  onUnattach: () => void;
  /** "Draw arrow..." — enters pending-arrow mode. The next click on
   *  a battlefield card OR player life-pill resolves the arrow;
   *  Escape or clicking the source cancels. Ports Cockatrice's
   *  `actDrawArrow` → `CardItem::drawArrow(Qt::red)`. */
  onDrawArrow: () => void;
  /** "Reduce life by power" — sums the power of every selected card
   *  (or just this card when there's no selection) and subtracts from
   *  the life total. Ports `PlayerActions::actReduceLifeByPower`
   *  (player_actions.cpp:1432-1455). */
  onReduceLifeByPower: () => void;
  /** "Select All" — marquees every card in this card's zone (the
   *  battlefield, since the menu is only reachable from the board).
   *  Ports `PlayerActions::actSelectAll` (player_actions.cpp:720-728). */
  onSelectAll: () => void;
  /** "Select Row" — marquees every battlefield card in the same visual
   *  row (`slot.row`) as this card. Ports `actSelectRow`
   *  (player_actions.cpp:730-741). */
  onSelectRow: () => void;
  /** "Add counter (X)" — increments the counter at slot `counterId` by
   *  1. Ports `PlayerActions::actAddCardCounter` (player_actions.cpp:1519). */
  onAddCardCounter: (counterId: number) => void;
  /** "Set counters (X)..." — opens a numeric modal to set the counter
   *  at slot `counterId` to an absolute value. Ports
   *  `actRequestSetCardCounterDialog` / `actSetCardCounter`. */
  onSetCardCounter: (counterId: number) => void;
  /** Pre-built "Token: …" items appended to the bottom of the menu.
   *  Cockatrice's addRelatedCardActions (card_menu.cpp:407-479)
   *  iterates the card's related + reverse-related lists and adds
   *  one QAction per entry; we do the same in the caller and hand
   *  the finished items in so this builder stays wire-agnostic
   *  (no Dexie / token lookups needed here). */
  tokenItems?: ContextMenuItem[];
  /** The "View related cards" submenu with its leading separator
   *  (`buildRelatedViewItems`); desktop adds it after Card counters and
   *  before the token actions (card_menu.cpp:232-233). */
  relatedViewItems?: ContextMenuItem[];
}

export function buildCardContextMenu(args: BuildCardContextMenuArgs): ContextMenuItem[] {
  const counterItems: ContextMenuItem[] = [];
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
  // [Add, Set] shortcut actions per counter slot, read through
  // menuShortcut so rebinds update the menu chip immediately.
  // A/B/C ship Cockatrice defaults (Alt+. / Ctrl+. / Ctrl+>);
  // D/E/F have no default binding but can be bound.
  const counterShortcuts: [ActionId, ActionId][] = letters.map((letter) => [
    `game.addCounter${letter}`,
    `game.setCounter${letter}`,
  ]);
  letters.forEach((letter, i) => {
    if (i > 0) {
      counterItems.push({ divider: true });
    }
    counterItems.push({
      label: `Add counter (${letter})`,
      ...(counterShortcuts[i] && args.menuShortcut(counterShortcuts[i][0])),
      swatch: counterColorForId(i),
      onClick: () => args.onAddCardCounter(i),
    });
    counterItems.push({
      label: `Set counters (${letter})...`,
      ...(counterShortcuts[i] && args.menuShortcut(counterShortcuts[i][1])),
      swatch: counterColorForId(i),
      onClick: () => args.onSetCardCounter(i),
    });
  });

  return [
    { label: 'Tap / Untap', ...args.menuShortcut('game.tapCard'), onClick: args.onTapUntap },
    {
      label: 'Skip untapping',
      ...args.menuShortcut('game.doesntUntap'),
      checked: args.doesntUntap,
      onClick: args.onSkipUntapping,
    },
    {
      label: args.faceDown ? 'Turn Over (face up)' : 'Turn Over',
      ...args.menuShortcut('game.flipCard'),
      onClick: args.onFlip,
    },
    // Peek — only shown on face-down cards. Reveals the card to the
    // local player without flipping it (mirrors Cockatrice's aPeek).
    ...(args.faceDown
      ? [{ label: 'Peek card', ...args.menuShortcut('game.peekCard'), onClick: args.onPeek } as ContextMenuItem]
      : []),
    { divider: true },
    { label: 'Clone', ...args.menuShortcut('game.cloneCard'), onClick: args.onClone },
    {
      label: 'Move to',
      submenu: [
        {
          label: 'Top of library in random order',
          ...args.menuShortcut('game.moveSelectedToLibraryTop'),
          onClick: args.onMoveToTop,
        },
        { label: 'X cards from the top of library...', onClick: args.onMoveToXCardsFromTop },
        {
          label: 'Bottom of library in random order',
          ...args.menuShortcut('game.moveSelectedToLibraryBottom'),
          onClick: args.onMoveToBottom,
        },
        { divider: true },
        { label: 'Table', ...args.menuShortcut('game.moveSelectedToBattlefield'), onClick: args.onMoveToTable },
        { label: 'Hand', ...args.menuShortcut('game.moveSelectedToHand'), onClick: args.onMoveToHand },
        { divider: true },
        {
          label: 'Graveyard',
          ...args.menuShortcut('game.moveSelectedToGrave'),
          onClick: args.onMoveToGrave,
        },
        { label: 'Exile', ...args.menuShortcut('game.moveSelectedToExile'), onClick: args.onMoveToExile },
      ],
    },
    { divider: true },
    {
      label: 'Attach to card...',
      ...args.menuShortcut('game.attachCard'),
      onClick: args.onAttachToCard,
    },
    // Cockatrice hides "Unattach" for cards that aren't attached — only
    // include the item when there's actually something to detach.
    ...(args.isAttached
      ? [{ label: 'Unattach', ...args.menuShortcut('game.unattachCard'), onClick: args.onUnattach } as ContextMenuItem]
      : []),
    {
      label: 'Draw arrow...',
      ...args.menuShortcut('game.drawArrow'),
      onClick: args.onDrawArrow,
    },
    { divider: true },
    {
      label: 'Power / toughness',
      submenu: [
        { label: 'Increase power', ...args.menuShortcut('game.incP'), onClick: args.onIncP },
        { label: 'Decrease power', ...args.menuShortcut('game.decP'), onClick: args.onDecP },
        {
          label: 'Increase power and decrease toughness',
          ...args.menuShortcut('game.flowP'),
          onClick: args.onFlowP,
        },
        { divider: true },
        { label: 'Increase toughness', ...args.menuShortcut('game.incT'), onClick: args.onIncT },
        { label: 'Decrease toughness', ...args.menuShortcut('game.decT'), onClick: args.onDecT },
        {
          label: 'Decrease power and increase toughness',
          ...args.menuShortcut('game.flowT'),
          onClick: args.onFlowT,
        },
        { divider: true },
        { label: 'Increase power and toughness', ...args.menuShortcut('game.incPT'), onClick: args.onIncPT },
        { label: 'Decrease power and toughness', ...args.menuShortcut('game.decPT'), onClick: args.onDecPT },
        { divider: true },
        { label: 'Set power and toughness...', ...args.menuShortcut('game.setCardPT'), onClick: args.onSetPT },
        { label: 'Reset power and toughness', ...args.menuShortcut('game.resetPT'), onClick: args.onResetPT },
      ],
    },
    {
      label: 'Set annotation...',
      ...args.menuShortcut('game.setAnnotation'),
      onClick: args.onSetAnnotation,
    },
    { divider: true },
    {
      label: 'Reduce life by power',
      ...args.menuShortcut('game.reduceLifeByPower'),
      onClick: args.onReduceLifeByPower,
    },
    { divider: true },
    { label: 'Select All', ...args.menuShortcut('game.selectAllBattlefield'), onClick: args.onSelectAll },
    { label: 'Select Row', ...args.menuShortcut('game.selectRowBattlefield'), onClick: args.onSelectRow },
    { divider: true },
    { label: 'Card counters', submenu: counterItems },
    ...(args.relatedViewItems ?? []),
    // "Token: …" items — mirrors Cockatrice's addRelatedCardActions
    // (card_menu.cpp:407-479). The parent caller resolves each token
    // name into a menu item (label + onClick) and passes them in as
    // a flat array; we tack them on after Card counters and prefix
    // with a divider when non-empty so the shape stays 1:1 with
    // desktop's menu. Empty when the card has no related list or
    // none of its related names resolve in the tokens table.
    ...(args.tokenItems && args.tokenItems.length > 0
      ? [{ divider: true } as ContextMenuItem, ...args.tokenItems]
      : []),
  ];
}

export interface BuildOpponentCardMenuArgs {
  menuShortcut: MenuShortcutFor;
  /** Arrows belong to the local player, so any card can start one. */
  onDrawArrow: () => void;
  /** The token copy lands on the local player's battlefield. */
  onClone: () => void;
  onReduceLifeByPower: () => void;
  onSelectAll: () => void;
  onSelectRow: () => void;
  tokenItems?: ContextMenuItem[];
  relatedViewItems?: ContextMenuItem[];
}

/**
 * The menu of another player's battlefield card: desktop's `!canModifyCard`
 * branch on the TABLE zone (card_menu.cpp:183-194). Only the actions that do
 * not change that player's cards: no tap, flip, P/T, annotation, counters,
 * moves or attach.
 */
export function buildOpponentCardMenu(args: BuildOpponentCardMenuArgs): ContextMenuItem[] {
  return [
    { label: 'Draw arrow...', ...args.menuShortcut('game.drawArrow'), onClick: args.onDrawArrow },
    { label: 'Clone', ...args.menuShortcut('game.cloneCard'), onClick: args.onClone },
    { divider: true },
    {
      label: 'Reduce life by power',
      ...args.menuShortcut('game.reduceLifeByPower'),
      onClick: args.onReduceLifeByPower,
    },
    { divider: true },
    { label: 'Select All', ...args.menuShortcut('game.selectAllBattlefield'), onClick: args.onSelectAll },
    { label: 'Select Row', ...args.menuShortcut('game.selectRowBattlefield'), onClick: args.onSelectRow },
    ...(args.relatedViewItems ?? []),
    ...(args.tokenItems && args.tokenItems.length > 0
      ? [{ divider: true } as ContextMenuItem, ...args.tokenItems]
      : []),
  ];
}
