// The card menu for a hand card or a card in a library / sideboard zone view,
// as data. Ports desktop CardMenu::createHandOrCustomZoneMenu
// (card_menu.cpp:296-342); the builder only wires the caller's handlers.

import type { TFunction } from 'i18next';

import type { ContextMenuItem, MenuShortcutFor } from '../ContextMenu/ContextMenu';

/** Desktop MoveMenu's targets (move_menu.cpp), in menu order. */
export type HandCardMoveTarget = 'libraryTop' | 'libraryXFromTop' | 'libraryBottom' | 'table' | 'hand' | 'grave' | 'exile';

export interface BuildHandOrZoneCardMenuArgs {
  t: TFunction;
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
    label: args.t('CardMenu.selectAll'),
    ...hints('game.selectAllBattlefield'),
    onClick: args.onSelectAll,
  };

  if (!args.canModify) {
    return [
      { label: args.t('CardMenu.drawArrow'), ...hints('game.drawArrow'), onClick: args.onDrawArrow },
      { divider: true },
      { label: args.t('CardMenu.clone'), ...hints('game.cloneCard'), onClick: args.onClone },
      { divider: true },
      selectAll,
      ...related,
      ...tokens,
    ];
  }

  return [
    { label: args.t('CardMenu.play'), onClick: args.onPlay },
    { label: args.t('CardMenu.playFaceDown'), onClick: args.onPlayFaceDown },
    {
      label: args.t('CardMenu.revealTo'),
      submenu: [
        { label: args.t('CardMenu.allPlayers'), ...hints('game.revealSelectedToAll'), onClick: () => args.onReveal(-1) },
        { divider: true },
        ...args.revealTargets.map((t) => ({ label: t.name, onClick: () => args.onReveal(t.playerId) })),
      ],
    },
    { divider: true },
    { label: args.t('CardMenu.clone'), ...hints('game.cloneCard'), onClick: args.onClone },
    {
      label: args.t('CardMenu.moveTo'),
      submenu: [
        { label: args.t('CardMenu.topLibraryRandom'), onClick: () => args.onMove('libraryTop') },
        { label: args.t('CardMenu.xFromTop'), onClick: () => args.onMove('libraryXFromTop') },
        {
          label: args.t('CardMenu.bottomLibraryRandom'),
          ...hints('game.moveSelectedToLibraryBottom'),
          onClick: () => args.onMove('libraryBottom'),
        },
        { divider: true },
        { label: args.t('SettingsAppearance.zoneBackgrounds.zone.table'), onClick: () => args.onMove('table') },
        { divider: true },
        { label: args.t('ZoneLabel.title.hand'), onClick: () => args.onMove('hand') },
        { divider: true },
        { label: args.t('ZoneLabel.title.grave'), ...hints('game.moveSelectedToGrave'), onClick: () => args.onMove('grave') },
        { divider: true },
        { label: args.t('ZoneLabel.title.rfg'), onClick: () => args.onMove('exile') },
      ],
    },
    // Desktop drops Attach / Draw arrow for library and sideboard cards,
    // where they are "really wonky" (card_menu.cpp:322-327). Attach from the
    // hand is not wired in the web client yet.
    ...(inHand
      ? [
        { divider: true } as ContextMenuItem,
        { label: args.t('CardMenu.drawArrow'), ...hints('game.drawArrow'), onClick: args.onDrawArrow },
      ]
      : []),
    { divider: true },
    selectAll,
    ...(args.onSelectColumn
      ? [{ label: args.t('CardMenu.selectColumn'), ...hints('game.selectColumnBattlefield'), onClick: args.onSelectColumn }]
      : []),
    ...related,
    ...tokens,
  ];
}
