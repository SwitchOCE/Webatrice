// The card menu for a card in a read-only reveal window, as data. Ports
// desktop's revealed-card branch of CardMenu (card_menu.cpp:132-151):
// Hide, Clone, Select All and View related cards. Select Column is left
// out: the web reveal window has no fixed columns to select by.

import type { TFunction } from 'i18next';

import type { ContextMenuItem, MenuShortcutFor } from '../ContextMenu/ContextMenu';

export interface BuildRevealedCardMenuArgs {
  t: TFunction;
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
    { label: args.t('CardMenu.hide'), ...args.menuShortcut('game.hideRevealedCard'), onClick: args.onHide },
    { divider: true },
    { label: args.t('CardMenu.clone'), ...args.menuShortcut('game.cloneCard'), onClick: args.onClone },
    { divider: true },
    { label: args.t('CardMenu.selectAll'), ...args.menuShortcut('game.selectAllBattlefield'), onClick: args.onSelectAll },
    ...(args.relatedViewItems ?? []),
  ];
}
