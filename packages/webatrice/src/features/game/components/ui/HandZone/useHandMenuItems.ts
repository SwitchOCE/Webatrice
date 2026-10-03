import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import type { useShortcutHints } from '@app/feature-widgets/shortcuts';

import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { useGameDialogsContext } from '../GameDialogsContext';
import type { SeatMoveDestination, HandZoneViewModel, PlayerZoneCommands } from '../PlayerBoard/playerBoard.types';
import { buildRevealToSubmenu, toRecipient } from '../PlayerBoard/revealRecipient';

type ShortcutHints = ReturnType<typeof useShortcutHints>;

export interface UseHandMenuItemsArgs {
  seatId: number;
  isSelf: boolean;
  hand: HandZoneViewModel;
  /** Every other seated player. */
  revealTargets: readonly { playerId: number; name: string }[];
  shortcutHints: ShortcutHints;
  zoneCommands: PlayerZoneCommands;
}

/**
 * The hand menu (desktop HandMenu): view and sort the hand, reveal it or a
 * random card, mulligan, and move the whole hand. The hand row shows it on
 * right-click and the battlefield menu nests it.
 */
export function useHandMenuItems({
  seatId,
  isSelf,
  hand,
  revealTargets,
  shortcutHints,
  zoneCommands,
}: UseHandMenuItemsArgs) {
  const { openZoneView, handleRequestSortHandBy, handleRequestChooseMulligan } = useGameDialogsContext();

  // Prefer the server-broadcast count from `hand.cardCount`, which
  // is populated for BOTH self and opponents (HAND is a PrivateZone
  // but its cardCount is public). Falling back to `hand.cards.length`
  // as second choice would silently return 0 for opponents — their
  // hand.cards array is always empty because they don't ship the card
  // identities to us — so nullish-coalescing to it would leave the
  // badge stuck at 0.
  const handSize = hand.cardCount ?? hand.cards.length;
  // Reveal-hand submenus. Desktop always lists "All players", a
  // separator, then each other player, even when playing alone
  // (hand_menu.cpp:165-200). Same wire as reveal-library
  // (Command_RevealCards with zoneName=hand); the port omits playerId
  // for "All players".
  const revealHandSubmenu = buildRevealToSubmenu(
    revealTargets,
    (targetPlayerId) => zoneCommands.reveal(ZoneName.HAND, toRecipient(targetPlayerId)),
    handSize <= 0,
  );
  const revealRandomHandSubmenu = buildRevealToSubmenu(
    revealTargets,
    (targetPlayerId) => zoneCommands.reveal(ZoneName.HAND, toRecipient(targetPlayerId), 'random'),
    handSize <= 0,
  );
  // Helper: build a "move all cards from HAND to <target>" click
  // handler. Hand card ids are real numeric ids on the wire.
  const moveAllHandTo = (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
  ): (() => void) => () => {
    if (hand.cards.length === 0) {
      return;
    }
    const cardIds = hand.cards.map((c) => Number(c.id)).filter((id) => Number.isFinite(id));
    if (cardIds.length === 0) {
      return;
    }
    zoneCommands.moveCards(ZoneName.HAND, cardIds, { zone: targetZone, index });
  };
  const handMenuItems: ContextMenuItem[] = [
    {
      // View hand — the same zone view as View library /
      // graveyard / exile (desktop aViewHand). Only offered
      // for the local player; opponents' hands are hidden and the
      // dialog would have nothing to show.
      label: 'View hand',
      onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.HAND }),
      disabled: !isSelf || handSize <= 0,
    },
    {
      // Sort hand by ... — dispatches per-card moveCard reorders
      // in the calculated order. Matches Cockatrice's
      // hand_menu.cpp; async lookup for maintype / manacost keys.
      label: 'Sort hand by...',
      submenu: [
        {
          label: 'Name',
          onClick: () => handleRequestSortHandBy('name'),
          disabled: !isSelf || handSize <= 1,
        },
        {
          label: 'Type',
          onClick: () => handleRequestSortHandBy('maintype'),
          disabled: !isSelf || handSize <= 1,
          shortcut: shortcutHints['game.sortHandByType'],
        },
        {
          label: 'Mana Value',
          onClick: () => handleRequestSortHandBy('manacost'),
          disabled: !isSelf || handSize <= 1,
        },
      ],
    },
    {
      label: 'Reveal hand to...',
      submenu: revealHandSubmenu,
    },
    {
      label: 'Reveal random card to...',
      submenu: revealRandomHandSubmenu,
    },
    { divider: true },
    {
      // Opens a numeric prompt (dialog layer), then fires
      // Command_Mulligan with the resolved hand size. Accepts
      // -handSize..handSize+deckSize (≤0 is relative — desktop
      // parity, see handleRequestChooseMulligan in useGameDialogs).
      label: 'Take mulligan (Choose hand size)',
      onClick: () => handleRequestChooseMulligan(),
      disabled: !isSelf,
    },
    {
      label: 'Take mulligan (Same hand size)',
      onClick: () => zoneCommands.mulligan(handSize),
      disabled: handSize <= 0,
      shortcut: shortcutHints['game.mulliganSameSize'],
    },
    {
      label: 'Take mulligan (Hand size - 1)',
      onClick: () => zoneCommands.mulligan(Math.max(1, handSize - 1)),
      disabled: handSize <= 1,
      shortcut: shortcutHints['game.mulliganMinusOne'],
    },
    { divider: true },
    {
      label: 'Move hand to...',
      disabled: handSize <= 0,
      submenu: [
        {
          label: 'Top of library',
          onClick: moveAllHandTo(ZoneName.DECK, 0),
          disabled: handSize <= 0,
        },
        {
          label: 'Bottom of library',
          onClick: moveAllHandTo(ZoneName.DECK, 'end'),
          disabled: handSize <= 0,
        },
        { divider: true },
        {
          label: 'Graveyard',
          onClick: moveAllHandTo(ZoneName.GRAVE, 0),
          disabled: handSize <= 0,
        },
        { divider: true },
        {
          label: 'Exile',
          onClick: moveAllHandTo(ZoneName.EXILE, 0),
          disabled: handSize <= 0,
        },
      ],
    },
  ];

  return {
    handSize,
    handMenuItems,
  };
}
