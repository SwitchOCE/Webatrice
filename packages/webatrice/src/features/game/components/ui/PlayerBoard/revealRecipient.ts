import type { MenuShortcut } from '@app/feature-widgets/shortcuts';
import type { TFunction } from 'i18next';

import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import type { RevealRecipient } from './playerBoard.types';

/** A reveal menu's "All players" choice (desktop's default recipient). */
export const ALL_PLAYERS = -1;

/** The seat menus' reveal target, with the "All players" sentinel, as a reveal recipient. */
export const toRecipient = (targetPlayerId: number): RevealRecipient =>
  (targetPlayerId === ALL_PLAYERS ? 'all' : targetPlayerId);

/**
 * A "Reveal ... to..." submenu: "All players" (-1), a separator, then each
 * other player. Desktop builds every such list this way, whether or not
 * anyone else is seated (hand_menu.cpp:165-200, card_menu.cpp:360-369).
 */
export function buildRevealToSubmenu(
  t: TFunction,
  revealTargets: readonly { playerId: number; name: string }[] | undefined,
  onPick: (targetPlayerId: number) => void,
  disabled = false,
  allPlayersShortcut?: MenuShortcut,
): ContextMenuItem[] {
  return [
    { label: t('CardMenu.allPlayers'), onClick: () => onPick(ALL_PLAYERS), disabled, ...allPlayersShortcut },
    { divider: true },
    ...(revealTargets ?? []).map((t) => ({
      label: t.name,
      onClick: () => onPick(t.playerId),
      disabled,
    })),
  ];
}
