// The card menu for a card in a read-only reveal window, as data. Ports
// desktop's revealed-card branch of CardMenu (card_menu.cpp:132-151):
// Hide, Clone, Select All and View related cards. Select Column is left
// out: the web reveal window has no fixed columns to select by.

import type { ActionId } from '@app/feature-widgets/shortcuts';

import type { CardMenuItem } from './cardContextMenu.model';

export interface BuildRevealedCardMenuArgs {
  shortcutHints: Record<ActionId, string>;
  /** Hide the cards from this window only (desktop actHide); sends nothing. */
  onHide: () => void;
  onClone: () => void;
  onSelectAll: () => void;
  /** "View related cards" with its separator (buildRelatedViewItems). */
  relatedViewItems?: CardMenuItem[];
}

export function buildRevealedCardMenu(args: BuildRevealedCardMenuArgs): CardMenuItem[] {
  return [
    { label: 'Hide', shortcut: args.shortcutHints['game.hideRevealedCard'], onClick: args.onHide },
    { divider: true },
    { label: 'Clone', shortcut: args.shortcutHints['game.cloneCard'], onClick: args.onClone },
    { divider: true },
    { label: 'Select All', shortcut: args.shortcutHints['game.selectAllBattlefield'], onClick: args.onSelectAll },
    ...(args.relatedViewItems ?? []),
  ];
}
