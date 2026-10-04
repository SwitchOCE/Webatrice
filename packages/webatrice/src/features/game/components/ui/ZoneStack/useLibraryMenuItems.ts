import { ZoneName } from '@cockatrice/sockatrice';
import type { useShortcutHints } from '@app/feature-widgets/shortcuts';

import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import { useGameDialogsContext } from '../GameDialogsContext';
import type { PlayerZoneCommands } from '../PlayerBoard/playerBoard.types';
import { buildRevealToSubmenu, toRecipient } from '../PlayerBoard/revealRecipient';
import type { LibraryOps } from '../PlayerBoard/useLibraryOps';
import type { useSeatPrompts } from '../PlayerBoard/useSeatPrompts';

type ShortcutHints = ReturnType<typeof useShortcutHints>;
type SeatPrompts = ReturnType<typeof useSeatPrompts>;

export interface UseLibraryMenuItemsArgs {
  seatId: number;
  /** The library size the server reports. */
  deckCount: number;
  /** Every other seated player. */
  revealTargets: readonly { playerId: number; name: string }[];
  alwaysRevealTopCard: boolean;
  alwaysLookAtTopCard: boolean;
  draw: (n: number) => void;
  libraryOps: LibraryOps;
  openDrawCardsPrompt: SeatPrompts['openDrawCardsPrompt'];
  openViewLibraryCountPrompt: SeatPrompts['openViewLibraryCountPrompt'];
  openRevealTopCardsPrompt: SeatPrompts['openRevealTopCardsPrompt'];
  openMoveTopUntilDialog: () => void;
  /** The deck-editor link; undefined when the deck matches no saved deck. */
  onOpenDeckInEditor: (() => void) | undefined;
  shortcutHints: ShortcutHints;
  zoneCommands: PlayerZoneCommands;
}

/**
 * The library menu (desktop LibraryMenu) the battlefield menu nests: draw,
 * shuffle, the views, reveals and lends, the always-reveal / look toggles and
 * the top / bottom of library submenus.
 */
export function useLibraryMenuItems({
  seatId,
  deckCount,
  revealTargets,
  alwaysRevealTopCard,
  alwaysLookAtTopCard,
  draw,
  libraryOps,
  openDrawCardsPrompt,
  openViewLibraryCountPrompt,
  openRevealTopCardsPrompt,
  openMoveTopUntilDialog,
  onOpenDeckInEditor,
  shortcutHints,
  zoneCommands,
}: UseLibraryMenuItemsArgs) {
  const { openZoneView } = useGameDialogsContext();

  // Library menu items — ported 1:1 from Cockatrice's LibraryMenu.
  // Cockatrice attaches the SAME LibraryMenu instance to both the
  // library pile and the battlefield PlayerMenu (player_menu.cpp:23,67),
  // so the two entry points share this const. The top / bottom card
  // actions are the seat's library ops, which the shortcuts share.
  // "Reveal library to..." and "Reveal top cards to..." always list "All
  // players" first, even when playing alone (library_menu.cpp:259-267,
  // 295-303); the reveal-top-N variant opens a count prompt per pick. Lend
  // library lists only the other players (library_menu.cpp:280-293).
  const revealLibraryItems = buildRevealToSubmenu(
    revealTargets,
    (targetPlayerId) => zoneCommands.reveal(ZoneName.DECK, toRecipient(targetPlayerId)),
  );
  const lendLibraryItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? revealTargets.map((t) => ({
        label: t.name,
        onClick: () => zoneCommands.lendLibrary(t.playerId),
      }))
      : [{ label: '(no players)' }];
  const revealTopCardsItems = buildRevealToSubmenu(revealTargets, (targetPlayerId) =>
    openRevealTopCardsPrompt({
      targetPlayerId,
      targetName: revealTargets.find((t) => t.playerId === targetPlayerId)?.name ?? 'all players',
      deckSize: deckCount,
    }));
  // Desktop's topLibraryMenu (library_menu.cpp:50-62); the library pile's
  // menu shows the same submenu.
  const topLibraryItems: ContextMenuItem[] = [
    {
      label: 'Play top card',
      onClick: () => libraryOps.moveTopCard(ZoneName.STACK, 'end'),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.playTop'],
    },
    {
      label: 'Play top card face down',
      onClick: () => libraryOps.moveTopCard(ZoneName.TABLE, 'end', true),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveTopToPlayFaceDown'],
    },
    {
      label: 'Put top card on bottom',
      onClick: () => libraryOps.moveTopCard(ZoneName.DECK, 'end'),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveTopToBottom'],
    },
    { divider: true },
    {
      label: 'Move top card to graveyard',
      onClick: () => libraryOps.moveTopCard(ZoneName.GRAVE, 0),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveTopToGrave'],
    },
    {
      label: 'Move top cards to graveyard...',
      onClick: () => libraryOps.promptMoveTopCards(ZoneName.GRAVE),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveTopNToGrave'],
    },
    {
      label: 'Move top cards to graveyard face down...',
      onClick: () => libraryOps.promptMoveTopCards(ZoneName.GRAVE, true),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveTopNToGraveFaceDown'],
    },
    {
      label: 'Move top card to exile',
      onClick: () => libraryOps.moveTopCard(ZoneName.EXILE, 0),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveTopToExile'],
    },
    {
      label: 'Move top cards to exile...',
      onClick: () => libraryOps.promptMoveTopCards(ZoneName.EXILE),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveTopNToExile'],
    },
    {
      label: 'Move top cards to exile face down...',
      onClick: () => libraryOps.promptMoveTopCards(ZoneName.EXILE, true),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveTopNToExileFaceDown'],
    },
    {
      label: 'Put top cards on stack until…',
      onClick: openMoveTopUntilDialog,
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveTopUntil'],
    },
    { divider: true },
    {
      label: 'Shuffle top cards...',
      onClick: libraryOps.promptShuffleTopCards,
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.shuffleTopCards'],
    },
  ];
  // Desktop's bottomLibraryMenu (library_menu.cpp:64-78).
  const bottomLibraryItems: ContextMenuItem[] = [
    {
      label: 'Draw bottom card',
      onClick: () => libraryOps.moveBottomCard(ZoneName.HAND, 0),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.drawBottomCard'],
    },
    {
      label: 'Draw bottom cards...',
      onClick: () => libraryOps.promptMoveBottomCards(ZoneName.HAND),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.drawBottomCards'],
    },
    { divider: true },
    {
      label: 'Play bottom card',
      onClick: () => libraryOps.moveBottomCard(ZoneName.STACK, 'end'),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveBottomToPlay'],
    },
    {
      label: 'Play bottom card face down',
      onClick: () => libraryOps.moveBottomCard(ZoneName.TABLE, 'end', true),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveBottomToPlayFaceDown'],
    },
    {
      label: 'Put bottom card on top',
      onClick: () => libraryOps.moveBottomCard(ZoneName.DECK, 0),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveBottomToTop'],
    },
    { divider: true },
    {
      label: 'Move bottom card to graveyard',
      onClick: () => libraryOps.moveBottomCard(ZoneName.GRAVE, 0),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveBottomToGrave'],
    },
    {
      label: 'Move bottom cards to graveyard...',
      onClick: () => libraryOps.promptMoveBottomCards(ZoneName.GRAVE),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveBottomNToGrave'],
    },
    {
      label: 'Move bottom cards to graveyard face down...',
      onClick: () => libraryOps.promptMoveBottomCards(ZoneName.GRAVE, true),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveBottomNToGraveFaceDown'],
    },
    {
      label: 'Move bottom card to exile',
      onClick: () => libraryOps.moveBottomCard(ZoneName.EXILE, 0),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveBottomToExile'],
    },
    {
      label: 'Move bottom cards to exile...',
      onClick: () => libraryOps.promptMoveBottomCards(ZoneName.EXILE),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveBottomNToExile'],
    },
    {
      label: 'Move bottom cards to exile face down...',
      onClick: () => libraryOps.promptMoveBottomCards(ZoneName.EXILE, true),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.moveBottomNToExileFaceDown'],
    },
    { divider: true },
    {
      label: 'Shuffle bottom cards...',
      onClick: libraryOps.promptShuffleBottomCards,
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.shuffleBottomCards'],
    },
  ];
  const libraryMenuItems: ContextMenuItem[] = [
    {
      label: 'Draw card',
      onClick: () => draw(1),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.drawCard'],
    },
    {
      label: 'Draw cards...',
      onClick: () => openDrawCardsPrompt({ deckSize: deckCount }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.drawMultipleCards'],
    },
    {
      label: 'Undo last draw',
      onClick: () => zoneCommands.undoDraw(),
      // Cockatrice always shows this enabled; server rejects when
      // nothing to undo.
      shortcut: shortcutHints['game.undoDraw'],
    },
    { divider: true },
    {
      label: 'Shuffle',
      onClick: () => zoneCommands.shuffleLibrary(),
      disabled: deckCount <= 1,
      shortcut: shortcutHints['game.shuffleLibrary'],
    },
    { divider: true },
    {
      label: 'View library',
      onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.DECK }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.viewLibrary'],
    },
    {
      label: 'View top cards of library...',
      onClick: () =>
        openViewLibraryCountPrompt({ isReversed: false, deckSize: deckCount }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.viewTopCards'],
    },
    {
      label: 'View bottom cards of library...',
      onClick: () =>
        openViewLibraryCountPrompt({ isReversed: true, deckSize: deckCount }),
      disabled: deckCount <= 0,
      shortcut: shortcutHints['game.viewBottomCards'],
    },
    { divider: true },
    { label: 'Reveal library to...', submenu: revealLibraryItems },
    { label: 'Lend library to...', submenu: lendLibraryItems },
    { label: 'Reveal top cards to...', submenu: revealTopCardsItems },
    {
      label: 'Always reveal top card',
      checked: alwaysRevealTopCard ?? false,
      onClick: () => zoneCommands.setAlwaysRevealTopCard(!alwaysRevealTopCard),
      shortcut: shortcutHints['game.alwaysRevealTopCard'],
    },
    {
      label: 'Always look at top card',
      checked: alwaysLookAtTopCard ?? false,
      onClick: () => zoneCommands.setAlwaysLookAtTopCard(!alwaysLookAtTopCard),
      shortcut: shortcutHints['game.alwaysLookAtTopCard'],
    },
    { divider: true },
    {
      label: 'Top of library...',
      disabled: deckCount <= 0,
      submenu: topLibraryItems,
    },
    {
      label: 'Bottom of library...',
      disabled: deckCount <= 0,
      submenu: bottomLibraryItems,
    },
    { divider: true },
    {
      // Opens the deck being played in the deck editor as an
      // unsaved draft (desktop actOpenDeckInDeckEditor); disabled
      // until the deck is known.
      label: 'Open deck in deck editor',
      onClick: onOpenDeckInEditor,
      disabled: !onOpenDeckInEditor,
    },
  ];

  return {
    libraryMenuItems,
    topLibraryItems,
    bottomLibraryItems,
  };
}
