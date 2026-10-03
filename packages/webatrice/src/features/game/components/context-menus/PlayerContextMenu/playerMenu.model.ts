// The seat's player menus as data: the library, hand, counters, own
// battlefield and opponent battlefield menus (desktop's LibraryMenu,
// HandMenu and PlayerMenu, player_menu.cpp). Extracted unchanged from
// PlayerBox so the seat regions that render them can move without carrying
// the item lists, and so new player-menu items land here rather than in
// PlayerBox JSX. The builders only wire the caller's handlers.

import { ZoneName, type ZoneNameValue } from '@cockatrice/sockatrice';

import type { ActionId } from '@app/feature-widgets/shortcuts';

import type { ContextMenuItem } from '../../PlayerBox/ContextMenu';
import type { TallyType } from '../../../utils/tally';
import type { HandSortKey, ZoneViewTarget } from '../../../hooks/dialogs/gameDialogs.types';
import type { SeatSelection } from '../../../hooks/useSeatSelection';
import type {
  BattlefieldCardViewModel,
  PlayerCardViewModel,
  PlayerZoneCommands,
  SeatMoveDestination,
} from '../../ui/PlayerBoard/playerBoard.types';

// Matches Cockatrice's counter_limits.h — Servatrice clamps card
// counter values to [0, 999] server-side. Used client-side by the
// "Increment all card counters" flow to skip counters already at
// the cap (matches actIncrementAllCardCounters at
// player_actions.cpp:1605).
export const MAX_COUNTER_VALUE = 999;

type ShortcutHints = Record<ActionId, string>;
type RevealTargets = readonly { playerId: number; name: string }[] | undefined;

/**
 * A "Reveal ... to..." submenu: "All players" (-1), a separator, then each
 * other player. Desktop builds every such list this way, whether or not
 * anyone else is seated (hand_menu.cpp:165-200, card_menu.cpp:360-369).
 */
export function buildRevealToSubmenu(
  revealTargets: RevealTargets,
  onPick: (targetPlayerId: number) => void,
  disabled = false,
  allPlayersShortcut?: string,
): ContextMenuItem[] {
  return [
    { label: 'All players', onClick: () => onPick(-1), disabled, shortcut: allPlayersShortcut },
    { divider: true },
    ...(revealTargets ?? []).map((t) => ({
      label: t.name,
      onClick: () => onPick(t.playerId),
      disabled,
    })),
  ];
}

/**
 * The "Tally" submenu: exclusive checkable None, a separator, then Subtypes,
 * Total Power and Total Toughness (desktop TallyMenu, tally_menu.cpp). It
 * sets a local preference; nothing is sent.
 */
export function buildTallyMenu(current: TallyType, onSet: (type: TallyType) => void): ContextMenuItem {
  const option = (type: TallyType, label: string): ContextMenuItem => ({
    label,
    checked: current === type,
    onClick: () => onSet(type),
  });
  return {
    label: 'Tally',
    submenu: [
      option('none', 'None'),
      { divider: true },
      option('subtypes', 'Subtypes'),
      option('power', 'Total Power'),
      option('toughness', 'Total Toughness'),
    ],
  };
}

/**
 * The "Custom Zones" submenu, one "View custom zone '<name>'" item per zone
 * (desktop CustomZoneMenu, custom_zone_menu.cpp), or nothing when the player
 * has none: desktop hides the menu while it is empty.
 */
export function buildCustomZonesMenu(
  zones: readonly { name: string }[],
  onView: (zoneName: string) => void,
): ContextMenuItem[] {
  if (zones.length === 0) {
    return [];
  }
  return [{
    label: 'Custom Zones',
    submenu: zones.map((zone) => ({ label: `View custom zone '${zone.name}'`, onClick: () => onView(zone.name) })),
  }];
}

export interface LibraryMenuArgs {
  shortcutHints: ShortcutHints;
  seatId: number;
  deckCount: number;
  revealTargets: RevealTargets;
  alwaysRevealTopCard: boolean | undefined;
  alwaysLookAtTopCard: boolean | undefined;
  draw: (n: number) => void;
  openZoneView: (view: ZoneViewTarget) => void;
  openDrawCardsPrompt: (args: { deckSize: number }) => void;
  openViewLibraryCountPrompt: (args: { isReversed: boolean; deckSize: number }) => void;
  openRevealTopCardsPrompt: (args: { targetPlayerId: number; targetName: string; deckSize: number }) => void;
  openCountPrompt: (args: {
    title: string;
    submitLabel: string;
    deckSize: number;
    onSubmit: (n: number) => void;
  }) => void;
  openMoveTopUntilDialog: () => void;
  /** Click handlers for the "Top of library..." / "Bottom of library..." rows. */
  buildMoveTopCardTo: (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
    faceDown?: boolean,
  ) => () => void;
  buildMoveBottomCardTo: (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
    faceDown?: boolean,
  ) => () => void;
  promptMoveTopNTo: (title: string, targetZone: ZoneNameValue, faceDown?: boolean) => () => void;
  promptMoveBottomNTo: (
    title: string,
    submitLabel: string,
    targetZone: ZoneNameValue,
    faceDown?: boolean,
  ) => () => void;
  onUndoDraw?: () => void;
  onShuffle?: () => void;
  onShuffleRange?: (start: number, end: number) => void;
  onRevealLibrary?: (targetPlayerId: number) => void;
  onLendLibrary?: (targetPlayerId: number) => void;
  onSetAlwaysRevealTopCard?: (value: boolean) => void;
  onSetAlwaysLookAtTopCard?: (value: boolean) => void;
  onOpenDeckInEditor?: () => void;
}

// Library menu items — ported 1:1 from Cockatrice's LibraryMenu.
// Cockatrice attaches the SAME LibraryMenu instance to both the
// library pile and the battlefield PlayerMenu (player_menu.cpp:23,67),
// so the two entry points share this const.
export function buildLibraryMenu({
  shortcutHints, seatId, deckCount, revealTargets, alwaysRevealTopCard, alwaysLookAtTopCard,
  draw, openZoneView, openDrawCardsPrompt, openViewLibraryCountPrompt, openRevealTopCardsPrompt,
  openCountPrompt, openMoveTopUntilDialog, buildMoveTopCardTo, buildMoveBottomCardTo,
  promptMoveTopNTo, promptMoveBottomNTo, onUndoDraw, onShuffle, onShuffleRange, onRevealLibrary,
  onLendLibrary, onSetAlwaysRevealTopCard, onSetAlwaysLookAtTopCard, onOpenDeckInEditor,
}: LibraryMenuArgs): ContextMenuItem[] {
  // Reveal targets → submenu builder for "Reveal library to..." and
  // "Reveal top cards to...". Reveal-library variant includes an "All
  // players" option; reveal-top-N variant opens a numeric prompt per
  // pick. Lend-library variant omits "All players" (library_menu.cpp:280-293).
  const revealLibraryItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? [
        { label: 'All players', onClick: () => onRevealLibrary?.(-1) },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () => onRevealLibrary?.(t.playerId),
        })),
      ]
      : [{ label: '(no players)' }];
  const lendLibraryItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? revealTargets.map((t) => ({
        label: t.name,
        onClick: () => onLendLibrary?.(t.playerId),
      }))
      : [{ label: '(no players)' }];
  const revealTopCardsItems: ContextMenuItem[] =
    revealTargets && revealTargets.length > 0
      ? [
        {
          label: 'All players',
          onClick: () =>
            openRevealTopCardsPrompt({
              targetPlayerId: -1,
              targetName: 'all players',
              deckSize: deckCount,
            }),
        },
        { divider: true },
        ...revealTargets.map((t) => ({
          label: t.name,
          onClick: () =>
            openRevealTopCardsPrompt({
              targetPlayerId: t.playerId,
              targetName: t.name,
              deckSize: deckCount,
            }),
        })),
      ]
      : [{ label: '(no players)' }];
  return [
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
      onClick: () => onUndoDraw?.(),
      // Cockatrice always shows this enabled; server rejects when
      // nothing to undo.
      shortcut: shortcutHints['game.undoDraw'],
    },
    { divider: true },
    {
      label: 'Shuffle',
      onClick: () => onShuffle?.(),
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
      onClick: () => onSetAlwaysRevealTopCard?.(!alwaysRevealTopCard),
      shortcut: shortcutHints['game.alwaysRevealTopCard'],
    },
    {
      label: 'Always look at top card',
      checked: alwaysLookAtTopCard ?? false,
      onClick: () => onSetAlwaysLookAtTopCard?.(!alwaysLookAtTopCard),
      shortcut: shortcutHints['game.alwaysLookAtTopCard'],
    },
    { divider: true },
    {
      label: 'Top of library...',
      disabled: deckCount <= 0,
      submenu: [
        {
          label: 'Play top card',
          onClick: buildMoveTopCardTo(ZoneName.STACK, 'end'),
          disabled: deckCount <= 0,
          shortcut: shortcutHints['game.playTop'],
        },
        {
          label: 'Play top card face down',
          onClick: buildMoveTopCardTo(ZoneName.TABLE, 'end', true),
          disabled: deckCount <= 0,
        },
        {
          label: 'Put top card on bottom',
          onClick: buildMoveTopCardTo(ZoneName.DECK, 'end'),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: 'Move top card to graveyard',
          onClick: buildMoveTopCardTo(ZoneName.GRAVE, 0),
          disabled: deckCount <= 0,
          shortcut: shortcutHints['game.moveTopToGrave'],
        },
        {
          label: 'Move top cards to graveyard...',
          onClick: promptMoveTopNTo('Move top cards to graveyard', ZoneName.GRAVE),
          disabled: deckCount <= 0,
          shortcut: shortcutHints['game.moveTopNToGrave'],
        },
        {
          label: 'Move top cards to graveyard face down...',
          onClick: promptMoveTopNTo(
            'Move top cards to graveyard face down',
            ZoneName.GRAVE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move top card to exile',
          onClick: buildMoveTopCardTo(ZoneName.EXILE, 0),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move top cards to exile...',
          onClick: promptMoveTopNTo('Move top cards to exile', ZoneName.EXILE),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move top cards to exile face down...',
          onClick: promptMoveTopNTo(
            'Move top cards to exile face down',
            ZoneName.EXILE,
            true,
          ),
          disabled: deckCount <= 0,
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
          onClick: () => {
            const size = deckCount;
            if (!onShuffleRange || size <= 0) {
              return;
            }
            openCountPrompt({
              title: 'Shuffle top cards',
              submitLabel: 'Shuffle',
              deckSize: size,
              onSubmit: (n) => {
                const count = Math.min(n, size);
                if (count <= 0) {
                  return;
                }
                // Command_Shuffle range is inclusive: [0, N-1] shuffles
                // positions 0..N-1 (player_actions.cpp:267-268).
                onShuffleRange(0, count - 1);
              },
            });
          },
          disabled: deckCount <= 0,
        },
      ],
    },
    {
      label: 'Bottom of library...',
      disabled: deckCount <= 0,
      submenu: [
        {
          label: 'Draw bottom card',
          onClick: buildMoveBottomCardTo(ZoneName.HAND, 0),
          disabled: deckCount <= 0,
        },
        {
          label: 'Draw bottom cards...',
          onClick: promptMoveBottomNTo(
            'Draw bottom cards',
            'Draw',
            ZoneName.HAND,
          ),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: 'Play bottom card',
          onClick: buildMoveBottomCardTo(ZoneName.STACK, 'end'),
          disabled: deckCount <= 0,
        },
        {
          label: 'Play bottom card face down',
          onClick: buildMoveBottomCardTo(ZoneName.TABLE, 'end', true),
          disabled: deckCount <= 0,
        },
        {
          label: 'Put bottom card on top',
          onClick: buildMoveBottomCardTo(ZoneName.DECK, 0),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: 'Move bottom card to graveyard',
          onClick: buildMoveBottomCardTo(ZoneName.GRAVE, 0),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom cards to graveyard...',
          onClick: promptMoveBottomNTo(
            'Move bottom cards to graveyard',
            'Move',
            ZoneName.GRAVE,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom cards to graveyard face down...',
          onClick: promptMoveBottomNTo(
            'Move bottom cards to graveyard face down',
            'Move',
            ZoneName.GRAVE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom card to exile',
          onClick: buildMoveBottomCardTo(ZoneName.EXILE, 0),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom cards to exile...',
          onClick: promptMoveBottomNTo(
            'Move bottom cards to exile',
            'Move',
            ZoneName.EXILE,
          ),
          disabled: deckCount <= 0,
        },
        {
          label: 'Move bottom cards to exile face down...',
          onClick: promptMoveBottomNTo(
            'Move bottom cards to exile face down',
            'Move',
            ZoneName.EXILE,
            true,
          ),
          disabled: deckCount <= 0,
        },
        { divider: true },
        {
          label: 'Shuffle bottom cards...',
          onClick: () => {
            const size = deckCount;
            if (!onShuffleRange || size <= 0) {
              return;
            }
            openCountPrompt({
              title: 'Shuffle bottom cards',
              submitLabel: 'Shuffle',
              deckSize: size,
              onSubmit: (n) => {
                const count = Math.min(n, size);
                if (count <= 0) {
                  return;
                }
                // `[-N, -1]` — negative indices count from the end
                // (server accepts either sign; Cockatrice desktop
                // always sends negative for bottom, :298-299).
                onShuffleRange(-count, -1);
              },
            });
          },
          disabled: deckCount <= 0,
        },
      ],
    },
    { divider: true },
    {
      // Opens the deck being played in the deck editor as an unsaved
      // draft (library_menu.cpp:203-205). Disabled until the deck is
      // known (useOpenDeckInEditor).
      label: 'Open deck in deck editor',
      onClick: onOpenDeckInEditor,
      disabled: !onOpenDeckInEditor,
    },
  ];
}

export interface HandMenuArgs {
  shortcutHints: ShortcutHints;
  seatId: number;
  isSelf: boolean;
  /** Server-broadcast hand count (PlayerBox's `handSize`). */
  handSize: number;
  handCards: readonly PlayerCardViewModel[] | undefined;
  revealTargets: RevealTargets;
  openZoneView: (view: ZoneViewTarget) => void;
  handleRequestSortHandBy: (key: HandSortKey) => void;
  handleRequestChooseMulligan: () => void;
  onMoveCards?: PlayerZoneCommands['moveCards'];
  onMulligan?: (number: number) => void;
  onRevealZone?: (zoneName: string, targetPlayerId: number) => void;
  onRevealRandomFromZone?: (zoneName: string, targetPlayerId: number) => void;
}

export function buildHandMenu({
  shortcutHints, seatId, isSelf, handSize, handCards, revealTargets, openZoneView,
  handleRequestSortHandBy, handleRequestChooseMulligan, onMoveCards, onMulligan, onRevealZone,
  onRevealRandomFromZone,
}: HandMenuArgs): ContextMenuItem[] {
  // Reveal-hand submenus. Desktop always lists "All players", a
  // separator, then each other player, even when playing alone
  // (hand_menu.cpp:165-200). Same wire as reveal-library
  // (Command_RevealCards with zoneName=hand); the port omits playerId
  // for "All players" (-1).
  const revealHandSubmenu = buildRevealToSubmenu(
    revealTargets,
    (targetPlayerId) => onRevealZone?.(ZoneName.HAND, targetPlayerId),
    handSize <= 0,
  );
  const revealRandomHandSubmenu = buildRevealToSubmenu(
    revealTargets,
    (targetPlayerId) => onRevealRandomFromZone?.(ZoneName.HAND, targetPlayerId),
    handSize <= 0,
  );
  // Helper: build a "move all cards from HAND to <target>" click
  // handler. Hand card ids are real numeric ids on the wire.
  const moveAllHandTo = (
    targetZone: ZoneNameValue,
    index: SeatMoveDestination['index'],
  ): (() => void) => () => {
    if (!onMoveCards || !handCards || handCards.length === 0) {
      return;
    }
    const cardIds = handCards.map((c) => Number(c.id)).filter((id) => Number.isFinite(id));
    if (cardIds.length === 0) {
      return;
    }
    onMoveCards(ZoneName.HAND, cardIds, { zone: targetZone, index });
  };
  return [
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
      onClick: () => onMulligan?.(handSize),
      disabled: handSize <= 0,
      shortcut: shortcutHints['game.mulliganSameSize'],
    },
    {
      label: 'Take mulligan (Hand size - 1)',
      onClick: () => onMulligan?.(Math.max(1, handSize - 1)),
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
}

export interface CountersMenuArgs {
  manaColors: readonly { symbol: 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'O'; label: string }[];
  manaCounters?: Partial<
    Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'O', { id: number; count: number }>
  >;
  lifeControl?: {
    onDelta: (delta: number) => void;
  };
  openLifePrompt: () => void;
  openCounterPrompt: (args: { counterId: number; label: string; currentValue: number }) => void;
  onModifyCounter?: (counterId: number, delta: number) => void;
  onSetPlayerCounter?: (counterId: number, value: number) => void;
}

export function buildCountersMenu({
  manaColors, manaCounters, lifeControl, openLifePrompt, openCounterPrompt, onModifyCounter,
  onSetPlayerCounter,
}: CountersMenuArgs): ContextMenuItem[] {
  // Counters submenu — Cockatrice's AbstractCounter builds a menu per
  // counter with "Set counter..." + ±1..±10 rows (abstract_counter.cpp:36-57).
  // We already have all the wires for these: `lifeControl.onDelta` /
  // `.onSet` for life, and `onModifyCounter(id, delta)` for the mana
  // pool. Just build the delta list programmatically and hand it to
  // each counter's submenu. "Set counter..." on Life reuses the
  // existing Ctrl+L modal; mana counters don't have a set-modal yet
  // so their Set row is disabled.
  const buildDeltaItems = (
    apply: (delta: number) => void,
  ): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    // +10 down to +1
    for (let i = 10; i >= 1; i--) {
      items.push({ label: `+${i}`, onClick: () => apply(i) });
    }
    items.push({ divider: true });
    // -1 down to -10
    for (let i = 1; i <= 10; i++) {
      items.push({ label: `-${i}`, onClick: () => apply(-i) });
    }
    return items;
  };
  const lifeCounterItems: ContextMenuItem[] = [
    {
      label: 'Set counter...',
      onClick: () => openLifePrompt(),
      disabled: !lifeControl,
    },
    { divider: true },
    ...buildDeltaItems((d) => lifeControl?.onDelta(d)),
  ];
  const manaCounterSubmenus: ContextMenuItem[] = manaColors.map((m) => {
    const counter = manaCounters?.[m.symbol];
    const canModify = counter != null && onModifyCounter != null;
    const canSet = counter != null && onSetPlayerCounter != null;
    return {
      label: m.label,
      // Disable the whole counter's submenu when we don't have a
      // counter id from Redux (pre-hydration transient) — every row
      // inside would no-op anyway.
      disabled: !canModify,
      submenu: [
        {
          // The same sum prompt Ctrl+L opens, titled with the
          // counter name. Fires Command_SetCounter with the
          // absolute value.
          label: 'Set counter...',
          onClick: () => {
            if (counter) {
              openCounterPrompt({
                counterId: counter.id,
                label: m.label,
                currentValue: counter.count,
              });
            }
          },
          disabled: !canSet,
        },
        { divider: true },
        ...buildDeltaItems((d) => {
          if (canModify) {
            onModifyCounter(counter.id, d);
          }
        }),
      ],
    };
  });
  return [
    { label: 'Life', submenu: lifeCounterItems },
    ...manaCounterSubmenus,
  ];
}

export interface BattlefieldMenuArgs<Token> {
  shortcutHints: ShortcutHints;
  handMenuItems: ContextMenuItem[];
  libraryMenuItems: ContextMenuItem[];
  graveMenuItemsSelf: ContextMenuItem[];
  exileMenuItemsSelf: ContextMenuItem[];
  countersMenuItems: ContextMenuItem[];
  selection: SeatSelection | null;
  battlefieldDisplayList: readonly BattlefieldCardViewModel[];
  /** The last submitted token, re-fired by "Create another token". */
  lastToken: Token | null;
  openCreateTokenDialog: () => void;
  onCreateToken?: (token: Token) => void;
  onRequestViewSideboard: () => void;
  onRequestRollDie?: () => void;
  onRequestGameInfo?: () => void;
  onBulkSetCardCounters?: (
    entries: readonly {
      cardId: number;
      counterId: number;
      value: number;
    }[],
  ) => void;
  onUntapAll?: () => void;
  onFlipCoin?: () => void;
  /** "Custom Zones" (buildCustomZonesMenu), after Sideboard. */
  customZonesItems?: ContextMenuItem[];
  /** Player-menu entries after the utility items, desktop order: Tally,
   *  then Say (player_menu.cpp:48-54). */
  trailingItems?: ContextMenuItem[];
}

// Battlefield right-click menu — Cockatrice's PlayerMenu (attached
// to the TableZoneGraphicsItem, player_menu.cpp:60-62). Shape
// matches 1:1 with the desktop menu. Pile submenus (Hand, Library,
// Graveyard, Exile, Sideboard) already have their own right-click
// menus on their piles; here we surface a single hint item pointing
// there instead of duplicating hundreds of lines of already-wired
// items. Utility actions we don't yet wire render disabled so the
// shape still reads as identical to Cockatrice. Gated to isSelf per
// player_menu.cpp — spectators / opponents don't get this menu.
export function buildBattlefieldMenu<Token>({
  shortcutHints, handMenuItems, libraryMenuItems, graveMenuItemsSelf, exileMenuItemsSelf,
  countersMenuItems, selection, battlefieldDisplayList, lastToken, openCreateTokenDialog,
  onCreateToken, onRequestViewSideboard, onRequestRollDie, onRequestGameInfo,
  onBulkSetCardCounters, onUntapAll, onFlipCoin, customZonesItems = [], trailingItems = [],
}: BattlefieldMenuArgs<Token>): ContextMenuItem[] {
  // Rest of the battlefield menu — pile submenus are placeholders
  // (already wired on the piles themselves), utility items wire
  // Roll die and Game info via GameDialogActionsContext. Everything
  // else stays disabled with the correct label so the menu reads
  // identical in shape to Cockatrice's PlayerMenu.
  return [
    {
      label: 'Hand',
      submenu: handMenuItems,
    },
    {
      // Same items as right-clicking the library pile. Cockatrice's
      // PlayerMenu attaches the same LibraryMenu to both places
      // (player_menu.cpp:23,67).
      label: 'Library',
      submenu: libraryMenuItems,
    },
    {
      // Same items as right-clicking the graveyard pile. Cockatrice's
      // PlayerMenu attaches the same GraveyardMenu to both places
      // (player_menu.cpp:29,63). Top-level entry stays enabled even
      // when the pile is empty so the user can still open "View
      // graveyard" — individual submenu items handle their own
      // per-pile-count disabling.
      label: 'Graveyard',
      submenu: graveMenuItemsSelf,
    },
    {
      // Same items as right-clicking the exile pile. Cockatrice's
      // PlayerMenu attaches the same RfgMenu to both places
      // (player_menu.cpp:30,64).
      label: 'Exile',
      submenu: exileMenuItemsSelf,
    },
    {
      label: 'Sideboard',
      submenu: [
        {
          // Cockatrice's actViewSideboard opens the same zone-view
          // dialog that "View library" opens (player_actions.cpp:232-234).
          label: 'View sideboard',
          onClick: onRequestViewSideboard,
          shortcut: shortcutHints['game.viewSideboard'],
        },
      ],
    },
    ...customZonesItems,
    { divider: true },
    {
      // Counters submenu — Cockatrice's countersMenu lists every
      // per-player counter (life + w/u/b/r/g/x/storm) as its own
      // ±N/Set submenu (AbstractCounter, abstract_counter.cpp:36-57).
      // We already wire the deltas via lifeControl.onDelta and
      // onModifyCounter, and life's Set via the Ctrl+L modal.
      label: 'Counters',
      submenu: countersMenuItems,
    },
    {
      // "Increment all card counters" — port of Cockatrice's
      // actIncrementAllCardCounters (player_actions.cpp:1588-1621).
      // Target set: current battlefield selection if any, else every
      // card on this player's battlefield. For each targeted card,
      // iterate its EXISTING counters and bump each by +1, skipping
      // any already at MAX_COUNTER_VALUE (999). Cards with no counters
      // are silently no-ops — matches desktop, which only touches
      // counters that already exist rather than adding new ones.
      // Disabled when no callback is wired (pre-hydration transient)
      // or when there's simply nothing on the board with counters.
      label: 'Increment all card counters',
      shortcut: shortcutHints['game.incrementAllCardCounters'],
      onClick: () => {
        if (!onBulkSetCardCounters) {
          return;
        }
        const targets =
          selection?.zone === 'battlefield' && selection.ids.size > 0
            ? battlefieldDisplayList.filter((c) =>
              selection.ids.has(c.id),
            )
            : battlefieldDisplayList;
        // Collect every (cardId, counterId, currentValue+1) into one
        // list; the batching helper packs them into a single
        // CommandContainer so the whole increment lands atomically
        // (mirrors Cockatrice's prepareGameCommand(commandList) in
        // actIncrementAllCardCounters, player_actions.cpp:1618-1620).
        const entries: {
          cardId: number;
          counterId: number;
          value: number;
        }[] = [];
        for (const card of targets) {
          const cardIdNum = Number(card.id);
          if (!Number.isFinite(cardIdNum)) {
            continue;
          }
          for (const counter of card.counters ?? []) {
            if (counter.value >= MAX_COUNTER_VALUE) {
              continue;
            }
            entries.push({
              cardId: cardIdNum,
              counterId: counter.id,
              value: counter.value + 1,
            });
          }
        }
        if (entries.length > 0) {
          onBulkSetCardCounters(entries);
        }
      },
      disabled:
        !onBulkSetCardCounters || battlefieldDisplayList.length === 0,
    },
    { divider: true },
    {
      // "Untap all permanents" — port of Cockatrice's actUntapAll.
      // Fires one Command_SetCardAttr with cardId=-1 (Servatrice's
      // "all cards in zone" sentinel), which the server iterates
      // over every card in TABLE and untaps each while respecting
      // per-card `doesntUntap` flags (server_card.cpp:70). This is
      // the same wire the phase-tracker's untap-step double-click
      // fires (usePhaseBar.ts:41-51) — one wire, whole battlefield.
      // Not phase-gated here — the menu action is always available.
      label: 'Untap all permanents',
      onClick: () => onUntapAll?.(),
      disabled: !onUntapAll,
      shortcut: shortcutHints['game.untapAll'],
    },
    { divider: true },
    {
      label: 'Roll die...',
      onClick: () => onRequestRollDie?.(),
      shortcut: shortcutHints['game.rollDice'],
    },
    {
      // "Flip coin" — port of actFlipCoin (player_actions.cpp:866-872).
      // Cockatrice models a coin flip as a `Command_RollDie(sides=2,
      // count=1)`; server broadcasts Event_RollDie and the chat log
      // renders the heads/tails outcome.
      label: 'Flip coin',
      onClick: () => onFlipCoin?.(),
      disabled: !onFlipCoin,
      shortcut: shortcutHints['game.flipCoin'],
    },
    { divider: true },
    {
      // "Create token..." — opens the modal, on submit fires
      // Command_CreateToken and snapshots the payload into lastToken
      // so "Create another token" can re-fire without the modal.
      // Matches Cockatrice's actCreateToken (player_actions.cpp:878-892):
      // stores lastTokenInfo, then chains into actCreateAnotherToken.
      label: 'Create token...',
      onClick: () => openCreateTokenDialog(),
      disabled: !onCreateToken,
      shortcut: shortcutHints['game.createToken'],
    },
    {
      // "Create another token" — direct re-fire with the last submitted
      // args. Mirrors Cockatrice's actCreateAnotherToken which early-
      // returns when lastTokenInfo.name is empty (player_actions.cpp:895);
      // we disable the menu item instead so the state matches Cockatrice's
      // "enable" signal (requestEnableAndSetCreateAnotherTokenAction).
      label: 'Create another token',
      onClick: () => {
        if (onCreateToken && lastToken) {
          onCreateToken(lastToken);
        }
      },
      disabled: !onCreateToken || !lastToken,
      shortcut: shortcutHints['game.createAnotherToken'],
    },
    {
      label: 'Create predefined token',
      // Populated at runtime from the deck's tokens zone in Cockatrice.
      disabled: true,
    },
    { divider: true },
    {
      label: 'Game info...',
      onClick: () => onRequestGameInfo?.(),
    },
    ...trailingItems,
  ];
}

// Opponent battlefield right-click menu. Ports Cockatrice's
// player_menu.cpp:14-58 opponent branch: all utility items (Create
// token, Roll die, Counters, Untap all, Hand / Library / Sideboard
// submenus) are OWN-ONLY, so the opponent menu narrows to just the
// two public zones you can peek at — graveyard and exile — plus the
// menus every player's menu carries (Tally, player_menu.cpp:48). Reuses
// the same opponent grave/exile item arrays the pile-level menus
// already attach so "View graveyard" opens the same LibrarySearch
// dialog either way.
export function buildOpponentBattlefieldMenu({
  graveMenuItemsOpponent, exileMenuItemsOpponent, trailingItems = [],
}: {
  graveMenuItemsOpponent: ContextMenuItem[];
  exileMenuItemsOpponent: ContextMenuItem[];
  /** Entries every player's menu carries, such as Tally. */
  trailingItems?: ContextMenuItem[];
}): ContextMenuItem[] {
  return [
    { label: 'Graveyard', submenu: graveMenuItemsOpponent },
    { label: 'Exile', submenu: exileMenuItemsOpponent },
    ...trailingItems,
  ];
}
