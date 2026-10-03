import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { ALL_PLAYERS } from '../../../dialogs/RevealCardsDialog/revealRecipient';
import type { RevealRecipient } from './playerBoard.types';

/** The seat menus' reveal target, with the dialogs' "All players" sentinel, as a reveal recipient. */
export const toRecipient = (targetPlayerId: number): RevealRecipient =>
  (targetPlayerId === ALL_PLAYERS ? 'all' : targetPlayerId);

/**
 * A "Reveal ... to..." submenu: "All players" (-1), a separator, then each
 * other player. Desktop builds every such list this way, whether or not
 * anyone else is seated (hand_menu.cpp:165-200, card_menu.cpp:360-369).
 */
export function buildRevealToSubmenu(
  revealTargets: readonly { playerId: number; name: string }[] | undefined,
  onPick: (targetPlayerId: number) => void,
  disabled = false,
  allPlayersShortcut?: string,
): ContextMenuItem[] {
  return [
    { label: 'All players', onClick: () => onPick(ALL_PLAYERS), disabled, shortcut: allPlayersShortcut },
    { divider: true },
    ...(revealTargets ?? []).map((t) => ({
      label: t.name,
      onClick: () => onPick(t.playerId),
      disabled,
    })),
  ];
}
