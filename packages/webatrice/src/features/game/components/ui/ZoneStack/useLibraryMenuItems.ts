import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';
import { useTranslation } from 'react-i18next';

import type { ContextMenuItem, MenuShortcutFor } from '../../context-menus/ContextMenu/ContextMenu';
import { useGameDialogsContext } from '../GameDialogsContext';
import type { SeatMoveCard, SeatMoveDestination, PlayerZoneCommands } from '../PlayerBoard/playerBoard.types';
import { buildRevealToSubmenu, toRecipient } from '../PlayerBoard/revealRecipient';
import type { useSeatPrompts } from '../PlayerBoard/useSeatPrompts';

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
  openCountPrompt: SeatPrompts['openCountPrompt'];
  openDrawCardsPrompt: SeatPrompts['openDrawCardsPrompt'];
  openViewLibraryCountPrompt: SeatPrompts['openViewLibraryCountPrompt'];
  openRevealTopCardsPrompt: SeatPrompts['openRevealTopCardsPrompt'];
  openMoveTopUntilDialog: () => void;
  /** The deck-editor link; undefined when the deck matches no saved deck. */
  onOpenDeckInEditor: (() => void) | undefined;
  menuShortcut: MenuShortcutFor;
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
  openCountPrompt,
  openDrawCardsPrompt,
  openViewLibraryCountPrompt,
  openRevealTopCardsPrompt,
  openMoveTopUntilDialog,
  onOpenDeckInEditor,
  menuShortcut,
  zoneCommands,
}: UseLibraryMenuItemsArgs) {
  const { t } = useTranslation();
  const { openZoneView } = useGameDialogsContext();

  // Library menu items — ported 1:1 from Cockatrice's LibraryMenu.
  // Cockatrice attaches the SAME LibraryMenu instance to both the
  // library pile and the battlefield PlayerMenu (player_menu.cpp:23,67),
  // so the two entry points share this const.
  //
  // Helper: single-card "Top of library..." → target move click. Wire
  // uses cardId=0 (cmdSetTopCard, player_actions.cpp:376).
  const buildMoveTopCardTo = (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
    faceDown?: boolean,
  ): (() => void) => () => {
    if (deckCount <= 0) {
      return;
    }
    zoneCommands.moveCards(ZoneName.DECK, [faceDown ? { id: 0, faceDown: true } : 0], { zone: targetZone, index });
  };
  // Single-card "Bottom of library..." → target move click. Wire uses
  // cardId=deckCount-1 (cmdSetBottomCard, player_actions.cpp:384).
  const buildMoveBottomCardTo = (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
    faceDown?: boolean,
  ): (() => void) => () => {
    if (deckCount <= 0) {
      return;
    }
    const id = deckCount - 1;
    zoneCommands.moveCards(ZoneName.DECK, [faceDown ? { id, faceDown: true } : id], { zone: targetZone, index });
  };
  // Multi-card "Move top N to <target>" prompt. Iterates i in
  // [N-1..0] to match moveTopCardsTo iteration order (player_actions.cpp:475).
  const promptMoveTopNTo = (
    title: string,
    targetZone: ZoneNameValue,
    faceDown?: boolean,
  ): (() => void) => () => {
    const size = deckCount;
    if (size <= 0) {
      return;
    }
    openCountPrompt({
      title,
      submitLabel: t('ZoneMenu.actionMove'),
      deckSize: size,
      onSubmit: (n) => {
        const count = Math.min(n, size);
        if (count <= 0) {
          return;
        }
        const cards: SeatMoveCard[] = [];
        for (let i = count - 1; i >= 0; i--) {
          cards.push(faceDown ? { id: i, faceDown: true } : i);
        }
        zoneCommands.moveCards(ZoneName.DECK, cards, { zone: targetZone });
      },
    });
  };
  // Multi-card "Move bottom N to <target>" prompt. Iterates i in
  // [maxCards-N..maxCards-1] to match moveBottomCardsTo iteration
  // order (player_actions.cpp:673) and actDrawBottomCards (:798).
  const promptMoveBottomNTo = (
    title: string,
    submitLabel: string,
    targetZone: ZoneNameValue,
    faceDown?: boolean,
  ): (() => void) => () => {
    const size = deckCount;
    if (size <= 0) {
      return;
    }
    openCountPrompt({
      title,
      submitLabel,
      deckSize: size,
      onSubmit: (n) => {
        const count = Math.min(n, size);
        if (count <= 0) {
          return;
        }
        const cards: SeatMoveCard[] = [];
        for (let i = size - count; i < size; i++) {
          cards.push(faceDown ? { id: i, faceDown: true } : i);
        }
        zoneCommands.moveCards(ZoneName.DECK, cards, { zone: targetZone });
      },
    });
  };
  // "Reveal library to..." and "Reveal top cards to..." always list "All
  // players" first, even when playing alone (library_menu.cpp:259-267,
  // 295-303); the reveal-top-N variant opens a count prompt per pick. Lend
  // library lists only the other players (library_menu.cpp:280-293).
  const revealLibraryItems = buildRevealToSubmenu(
    t,
    revealTargets,
    (targetPlayerId) => zoneCommands.reveal(ZoneName.DECK, toRecipient(targetPlayerId)),
  );
  const lendLibraryItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? revealTargets.map((t) => ({
        label: t.name,
        onClick: () => zoneCommands.lendLibrary(t.playerId),
      }))
      : [{ label: t('ZoneMenu.noPlayers') }];
  const revealTopCardsItems = buildRevealToSubmenu(t, revealTargets, (targetPlayerId) =>
    openRevealTopCardsPrompt({
      targetPlayerId,
      targetName: revealTargets.find((target) => target.playerId === targetPlayerId)?.name ?? t('CardMenu.allPlayers'),
      deckSize: deckCount,
    }));
  const libraryMenuItems: ContextMenuItem[] = [
    {
      label: t('ShortcutsTab.action.game.drawCard'),
      onClick: () => draw(1),
      disabled: deckCount <= 0,
      ...menuShortcut('game.drawCard'),
    },
    {
      label: t('ZoneMenu.drawCards'),
      onClick: () => openDrawCardsPrompt({ deckSize: deckCount }),
      disabled: deckCount <= 0,
      ...menuShortcut('game.drawMultipleCards'),
    },
    {
      label: t('ZoneMenu.undoDraw'),
      onClick: () => zoneCommands.undoDraw(),
      // Cockatrice always shows this enabled; server rejects when
      // nothing to undo.
      ...menuShortcut('game.undoDraw'),
    },
    { divider: true },
    {
      label: t('ZoneMenu.shuffle'),
      onClick: () => zoneCommands.shuffleLibrary(),
      disabled: deckCount <= 1,
      ...menuShortcut('game.shuffleLibrary'),
    },
    { divider: true },
    {
      label: t('ShortcutsTab.action.game.viewLibrary'),
      onClick: () => openZoneView({ playerId: seatId, zoneName: ZoneName.DECK }),
      disabled: deckCount <= 0,
      ...menuShortcut('game.viewLibrary'),
    },
    {
      label: t('ZoneMenu.viewTop'),
      onClick: () =>
        openViewLibraryCountPrompt({ isReversed: false, deckSize: deckCount }),
      disabled: deckCount <= 0,
      ...menuShortcut('game.viewTopCards'),
    },
    {
      label: t('ZoneMenu.viewBottom'),
      onClick: () =>
        openViewLibraryCountPrompt({ isReversed: true, deckSize: deckCount }),
      disabled: deckCount <= 0,
      ...menuShortcut('game.viewBottomCards'),
    },
    { divider: true },
    { label: t('ZoneMenu.revealLibrary'), submenu: revealLibraryItems },
    { label: t('ZoneMenu.lendLibrary'), submenu: lendLibraryItems },
    { label: t('ZoneMenu.revealTop'), submenu: revealTopCardsItems },
    {
      label: t('ZoneMenu.alwaysRevealTop'),
      checked: alwaysRevealTopCard ?? false,
      onClick: () => zoneCommands.setAlwaysRevealTopCard(!alwaysRevealTopCard),
      ...menuShortcut('game.alwaysRevealTopCard'),
    },
    {
      label: t('ZoneMenu.alwaysLookTop'),
      checked: alwaysLookAtTopCard ?? false,
      onClick: () => zoneCommands.setAlwaysLookAtTopCard(!alwaysLookAtTopCard),
      ...menuShortcut('game.alwaysLookAtTopCard'),
    },
    { divider: true },
    {
      label: t('ZoneMenu.topLibrary'),
      disabled: deckCount <= 0,
      submenu: [
        {
          label: t('ShortcutsTab.action.game.playTop'),
          onClick: buildMoveTopCardTo(ZoneName.STACK, 'end'),
          disabled: deckCount <= 0,
          ...menuShortcut('game.playTop'),
        },
        {
          label: t('ZoneMenu.playTopFaceDown'),
          onClick: buildMoveTopCardTo(ZoneName.TABLE, 'end', true),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.putTopOnBottom'),
          onClick: buildMoveTopCardTo(ZoneName.DECK, 'end'),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: t('ShortcutsTab.action.game.moveTopToGrave'),
          onClick: buildMoveTopCardTo(ZoneName.GRAVE, 0),
          disabled: deckCount <= 0,
          ...menuShortcut('game.moveTopToGrave'),
        },
        {
          label: t('ZoneMenu.moveTopNGrave'),
          onClick: promptMoveTopNTo(
            t('ZoneMenu.promptMoveTop', { target: t('ZoneLabel.title.grave') }),
            ZoneName.GRAVE,
          ),
          disabled: deckCount <= 0,
          ...menuShortcut('game.moveTopNToGrave'),
        },
        {
          label: t('ZoneMenu.moveTopNGraveFaceDown'),
          onClick: promptMoveTopNTo(
            t('ZoneMenu.promptMoveTop', { target: t('ZoneLabel.title.grave') }),
            ZoneName.GRAVE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.moveTopExile'),
          onClick: buildMoveTopCardTo(ZoneName.EXILE, 0),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.moveTopNExile'),
          onClick: promptMoveTopNTo(
            t('ZoneMenu.promptMoveTop', { target: t('ZoneLabel.title.rfg') }),
            ZoneName.EXILE,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.moveTopNExileFaceDown'),
          onClick: promptMoveTopNTo(
            t('ZoneMenu.promptMoveTop', { target: t('ZoneLabel.title.rfg') }),
            ZoneName.EXILE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: t('ShortcutsTab.action.game.moveTopUntil'),
          onClick: openMoveTopUntilDialog,
          disabled: deckCount <= 0,
          ...menuShortcut('game.moveTopUntil'),
        },
        { divider: true },
        {
          label: t('ZoneMenu.shuffleTop'),
          onClick: () => {
            const size = deckCount;
            if (size <= 0) {
              return;
            }
            openCountPrompt({
              title: t('ZoneMenu.promptShuffleTop'),
              submitLabel: t('ZoneMenu.shuffle'),
              deckSize: size,
              onSubmit: (n) => {
                const count = Math.min(n, size);
                if (count <= 0) {
                  return;
                }
                // Command_Shuffle range is inclusive: [0, N-1] shuffles
                // positions 0..N-1 (player_actions.cpp:267-268).
                zoneCommands.shuffleLibrary({ start: 0, end: count - 1 });
              },
            });
          },
          disabled: deckCount <= 0,
        },
      ],
    },
    {
      label: t('ZoneMenu.bottomLibrary'),
      disabled: deckCount <= 0,
      submenu: [
        {
          label: t('ZoneMenu.drawBottom'),
          onClick: buildMoveBottomCardTo(ZoneName.HAND, 0),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.drawBottomN'),
          onClick: promptMoveBottomNTo(
            t('ZoneMenu.promptDrawBottom'),
            t('ZoneMenu.actionDraw'),
            ZoneName.HAND,
          ),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: t('ZoneMenu.playBottom'),
          onClick: buildMoveBottomCardTo(ZoneName.STACK, 'end'),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.playBottomFaceDown'),
          onClick: buildMoveBottomCardTo(ZoneName.TABLE, 'end', true),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.putBottomOnTop'),
          onClick: buildMoveBottomCardTo(ZoneName.DECK, 0),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: t('ZoneMenu.moveBottomGrave'),
          onClick: buildMoveBottomCardTo(ZoneName.GRAVE, 0),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.moveBottomNGrave'),
          onClick: promptMoveBottomNTo(
            t('ZoneMenu.promptMoveBottom', { target: t('ZoneLabel.title.grave') }),
            t('ZoneMenu.actionMove'),
            ZoneName.GRAVE,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.moveBottomNGraveFaceDown'),
          onClick: promptMoveBottomNTo(
            t('ZoneMenu.promptMoveBottom', { target: t('ZoneLabel.title.grave') }),
            t('ZoneMenu.actionMove'),
            ZoneName.GRAVE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.moveBottomExile'),
          onClick: buildMoveBottomCardTo(ZoneName.EXILE, 0),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.moveBottomNExile'),
          onClick: promptMoveBottomNTo(
            t('ZoneMenu.promptMoveBottom', { target: t('ZoneLabel.title.rfg') }),
            t('ZoneMenu.actionMove'),
            ZoneName.EXILE,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: t('ZoneMenu.moveBottomNExileFaceDown'),
          onClick: promptMoveBottomNTo(
            t('ZoneMenu.promptMoveBottom', { target: t('ZoneLabel.title.rfg') }),
            t('ZoneMenu.actionMove'),
            ZoneName.EXILE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: t('ZoneMenu.shuffleBottom'),
          onClick: () => {
            const size = deckCount;
            if (size <= 0) {
              return;
            }
            openCountPrompt({
              title: t('ZoneMenu.promptShuffleBottom'),
              submitLabel: t('ZoneMenu.shuffle'),
              deckSize: size,
              onSubmit: (n) => {
                const count = Math.min(n, size);
                if (count <= 0) {
                  return;
                }
                // `[-N, -1]` — negative indices count from the end
                // (server accepts either sign; Cockatrice desktop
                // always sends negative for bottom, :298-299).
                zoneCommands.shuffleLibrary({ start: -count, end: -1 });
              },
            });
          },
          disabled: deckCount <= 0,
        },
      ],
    },
    { divider: true },
    {
      // Opens the deck being played in the deck editor as an
      // unsaved draft (desktop actOpenDeckInDeckEditor); disabled
      // until the deck is known.
      label: t('ZoneMenu.openDeckEditor'),
      onClick: onOpenDeckInEditor,
      disabled: !onOpenDeckInEditor,
    },
  ];

  return {
    libraryMenuItems,
  };
}
