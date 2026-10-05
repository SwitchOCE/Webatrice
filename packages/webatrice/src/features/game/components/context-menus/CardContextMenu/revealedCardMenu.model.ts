// The card menu for a card in a read-only reveal window, as data. Ports
// desktop's revealed-card branch of CardMenu (card_menu.cpp:132-151):
// Hide, Clone, Select All and View related cards. Select Column is left
// out: the web reveal window has no fixed columns to select by.

import type { ContextMenuItem, MenuShortcutFor } from '../ContextMenu/ContextMenu';

export interface BuildRevealedCardMenuArgs {
  menuShortcut: MenuShortcutFor;
  /** Hide the cards from this window only (desktop actHide); sends nothing. */
  onHide: () => void;
  onClone: () => void;
  onSelectAll: () => void;
  /** "View related cards" with its separator (buildRelatedViewItems). */
  relatedViewItems?: ContextMenuItem[];
}

export function buildRevealedCardMenu(args: BuildRevealedCardMenuArgs): ContextMenuItem[] {
  return [
    { label: 'Hide', ...args.menuShortcut('game.hideRevealedCard'), onClick: args.onHide },
    { divider: true },
    { label: 'Clone', ...args.menuShortcut('game.cloneCard'), onClick: args.onClone },
    { divider: true },
    { label: 'Select All', ...args.menuShortcut('game.selectAllBattlefield'), onClick: args.onSelectAll },
    ...(args.relatedViewItems ?? []),
  ];
}
