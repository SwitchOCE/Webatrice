// The card menu for a hand card or a card in a library / sideboard zone view,
// as data. Ports desktop CardMenu::createHandOrCustomZoneMenu
// (card_menu.cpp:296-342); the builder only wires the caller's handlers.

import type { ContextMenuItem, MenuShortcutFor } from '../ContextMenu/ContextMenu';

/** Desktop MoveMenu's targets (move_menu.cpp), in menu order. */
export type HandCardMoveTarget = 'libraryTop' | 'libraryXFromTop' | 'libraryBottom' | 'table' | 'hand' | 'grave' | 'exile';

export interface BuildHandOrZoneCardMenuArgs {
  menuShortcut: MenuShortcutFor;
  /** Where the card is: the hand, or a library / sideboard zone view. */
  source: 'hand' | 'zoneView';
  /** The local player owns the card or is a judge (desktop writeableCard).
   *  Otherwise the menu is the read-only branch. */
  canModify: boolean;
  /** The other players, for "Reveal to...". */
  revealTargets: readonly { playerId: number; name: string }[];
  onPlay: () => void;
  onPlayFaceDown: () => void;
  /** Reveal the selection to one player, or -1 for every player. */
  onReveal: (targetPlayerId: number) => void;
  onClone: () => void;
  onMove: (target: HandCardMoveTarget) => void;
  onDrawArrow: () => void;
  onSelectAll: () => void;
  /** Zone views only: the clicked card's column. */
  onSelectColumn?: () => void;
  /** "View related cards" with its separator (buildRelatedViewItems). */
  relatedViewItems?: ContextMenuItem[];
  /** "Token: …" items; desktop adds them for hand cards only. */
  tokenItems?: ContextMenuItem[];
}

export function buildHandOrZoneCardMenu(args: BuildHandOrZoneCardMenuArgs): ContextMenuItem[] {
  const hints = args.menuShortcut;
  const inHand = args.source === 'hand';
  const related = args.relatedViewItems ?? [];
  const tokens = inHand && args.tokenItems && args.tokenItems.length > 0
    ? [{ divider: true } as ContextMenuItem, ...args.tokenItems]
    : [];
  const selectAll: ContextMenuItem = {
    label: 'Select All',
    ...hints('game.selectAllBattlefield'),
    onClick: args.onSelectAll,
  };

  if (!args.canModify) {
    return [
      { label: 'Draw arrow...', ...hints('game.drawArrow'), onClick: args.onDrawArrow },
      { divider: true },
      { label: 'Clone', ...hints('game.cloneCard'), onClick: args.onClone },
      { divider: true },
      selectAll,
      ...related,
      ...tokens,
    ];
  }

  return [
    { label: 'Play', ...hints('game.playCard'), onClick: args.onPlay },
    { label: 'Play Face Down', ...hints('game.playCardFaceDown'), onClick: args.onPlayFaceDown },
    {
      label: 'Reveal to...',
      submenu: [
        { label: 'All players', ...hints('game.revealSelectedToAll'), onClick: () => args.onReveal(-1) },
        { divider: true },
        ...args.revealTargets.map((t) => ({ label: t.name, onClick: () => args.onReveal(t.playerId) })),
      ],
    },
    { divider: true },
    { label: 'Clone', ...hints('game.cloneCard'), onClick: args.onClone },
    {
      label: 'Move to',
      submenu: [
        {
          label: 'Top of library in random order',
          ...hints('game.moveSelectedToLibraryTop'),
          onClick: () => args.onMove('libraryTop'),
        },
        { label: 'X cards from the top of library...', onClick: () => args.onMove('libraryXFromTop') },
        {
          label: 'Bottom of library in random order',
          ...hints('game.moveSelectedToLibraryBottom'),
          onClick: () => args.onMove('libraryBottom'),
        },
        { divider: true },
        { label: 'Table', ...hints('game.moveSelectedToBattlefield'), onClick: () => args.onMove('table') },
        { divider: true },
        { label: 'Hand', ...hints('game.moveSelectedToHand'), onClick: () => args.onMove('hand') },
        { divider: true },
        { label: 'Graveyard', ...hints('game.moveSelectedToGrave'), onClick: () => args.onMove('grave') },
        { divider: true },
        { label: 'Exile', ...hints('game.moveSelectedToExile'), onClick: () => args.onMove('exile') },
      ],
    },
    // Desktop drops Attach / Draw arrow for library and sideboard cards,
    // where they are "really wonky" (card_menu.cpp:322-327). Attach from the
    // hand is not wired in the web client yet.
    ...(inHand
      ? [
        { divider: true } as ContextMenuItem,
        { label: 'Draw arrow...', ...hints('game.drawArrow'), onClick: args.onDrawArrow },
      ]
      : []),
    { divider: true },
    selectAll,
    ...(args.onSelectColumn
      ? [{ label: 'Select Column', ...hints('game.selectColumnBattlefield'), onClick: args.onSelectColumn }]
      : []),
    ...related,
    ...tokens,
  ];
}
