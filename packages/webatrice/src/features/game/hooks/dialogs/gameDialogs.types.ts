import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';

import type { SideboardPlanMove } from '../../dialogs/SideboardDialog/SideboardDialog';

// The game dialog and menu contract. `useGameDialogs` is the façade that builds
// it; the hooks beside this file each own one domain of it.

export interface AnchorPosition {
  top: number;
  left: number;
}

export interface ZoneViewTarget {
  playerId: number;
  zoneName: string;
}

export interface CardMenuState {
  card: ServerInfo_Card;
  sourcePlayerId: number;
  sourceZone: string;
  anchorPosition: AnchorPosition;
}

export interface ZoneMenuState {
  playerId: number;
  zoneName: string;
  anchorPosition: AnchorPosition;
}

export interface PromptState {
  title: string;
  label: string;
  initialValue?: string;
  helperText?: string;
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
}

export interface RevealState {
  title: string;
  zoneName: string;
  zoneLabel: string;
  showCountInput: boolean;
  defaultCount: number;
  onSubmit: (args: { targetPlayerId: number; topCards: number }) => void;
}

export type ConcedeConfirm = 'concede' | 'unconcede' | null;

export interface StartPendingSource {
  sourcePlayerId: number;
  sourceZone: string;
  sourceCardId: number;
}

// The dialogs slice splits into STATE (the open/closed flags + payloads that
// change as the user opens/closes dialogs) and ACTIONS (the stable open/close/
// request callbacks). Keeping them as separate types lets the hook return, the
// `GameDialogs` contract, and the test harness's no-op default all derive from
// one source instead of hand-syncing ~70 fields in three places. `GameDialogs`
// (their intersection) stays the single type every consumer reads.
export interface GameDialogsState {
  cardMenu: CardMenuState | null;
  zoneMenu: ZoneMenuState | null;
  playerMenu: AnchorPosition | null;
  handMenu: AnchorPosition | null;
  zoneViews: ZoneViewTarget[];
  prompt: PromptState | null;
  rollDieOpen: boolean;
  lastDieSides: number;
  lastDieCount: number;
  createTokenOpen: boolean;
  sideboardOpen: boolean;
  /** In-game live sideboard viewer — separate from `sideboardOpen`
   *  (which drives the older MUI sideboard-PLAN editor). Owner-only
   *  view, mounts the fancy LibrarySearchDialog against the player's
   *  own SIDEBOARD zone. Toggled from both the right-sidebar's
   *  Sideboard button and the battlefield menu's Sideboard → View
   *  sideboard item. */
  viewSideboardOpen: boolean;
  /** Trigger flags for the local player's PlayerBox to open its own
   *  LibrarySearchDialog / pileView. State lives in PlayerBox because
   *  the dialog is entangled with local props (enrichedDeckCards,
   *  onDumpTopCards, shuffle-on-close, drag refs). These booleans let
   *  external triggers — F3/F4 shortcuts, sidebar buttons — request
   *  the same dialog the battlefield menu opens, without duplicating
   *  the wire/dump/close plumbing. Owner-only: PlayerBox no-ops if
   *  `!isSelf`. */
  viewLibraryOpen: boolean;
  viewGraveyardOpen: boolean;
  gameInfoOpen: boolean;
  concedeConfirm: ConcedeConfirm;
  /** True while the leave-game confirmation dialog is open. Mirrors
   *  `concedeConfirm` — same guard-rail pattern for a destructive
   *  action, so accidental clicks on the sidebar Leave button don't
   *  drop the user out of a game they meant to stay in. */
  leaveConfirm: boolean;
  revealState: RevealState | null;
}

export interface GameDialogsActions {
  // Card/zone/player/hand menus
  closeCardMenu: () => void;
  closeZoneMenu: () => void;
  closePlayerMenu: () => void;
  closeHandMenu: () => void;
  handleCardContextMenu: (
    sourcePlayerId: number | undefined,
    sourceZone: string | undefined,
    card: ServerInfo_Card,
    event: React.MouseEvent,
  ) => void;
  handleZoneContextMenu: (
    playerId: number,
    zoneName: string,
    event: React.MouseEvent,
  ) => void;
  handlePlayerContextMenu: (event: React.MouseEvent) => void;
  handleHandContextMenu: (event: React.MouseEvent) => void;

  // Zone-view dialog stack
  handleZoneClick: (playerId: number, zoneName: string) => void;
  handleCloseZoneView: (playerId: number, zoneName: string, shuffleOnClose?: boolean) => void;

  // Prompt dialog
  closePrompt: () => void;

  // Roll die dialog
  openRollDie: () => void;
  closeRollDie: () => void;
  handleRollDieSubmit: (args: { sides: number; count: number }) => void;

  // Token / sideboard / game info / concede
  openCreateToken: () => void;
  closeCreateToken: () => void;
  handleCreateTokenSubmit: (args: {
    name: string;
    color: string;
    pt: string;
    annotation: string;
    destroyOnZoneChange: boolean;
    faceDown: boolean;
    providerId?: string;
  }) => void;

  openSideboard: () => void;
  closeSideboard: () => void;
  handleSideboardSubmit: (moveList: SideboardPlanMove[]) => void;
  handleToggleSideboardLock: (locked: boolean) => void;

  openViewSideboard: () => void;
  closeViewSideboard: () => void;

  openViewLibrary: () => void;
  closeViewLibrary: () => void;
  openViewGraveyard: () => void;
  closeViewGraveyard: () => void;

  openGameInfo: () => void;
  closeGameInfo: () => void;

  openConcede: () => void;
  openUnconcede: () => void;
  closeConcedeConfirm: () => void;
  confirmConcede: () => void;
  confirmUnconcede: () => void;

  openLeaveConfirm: () => void;
  closeLeaveConfirm: () => void;
  confirmLeave: () => void;

  // Reveal-cards dialog
  closeReveal: () => void;

  // Card context menu action handlers
  handleRequestSetPT: () => void;
  handleRequestSetAnnotation: () => void;
  handleRequestSetCardCounter: (counterId: number) => void;
  handleRequestDrawArrow: () => void;
  handleRequestAttach: () => void;
  handleRequestPlayFromCardMenu: (faceDown: boolean) => void;
  handleRequestMoveToLibraryAt: () => void;

  // Zone context menu action handlers
  handleRequestDrawN: () => void;
  handleRequestDumpN: () => void;
  handleRequestRevealTopN: () => void;
  handleRequestRevealZone: () => void;

  // Library extended actions
  handleRequestUndoDraw: () => void;
  handleRequestDrawBottom: () => void;
  handleRequestMoveTopCardToZone: (zone: string, options?: { x?: number }) => void;
  handleRequestPlayTop: (faceDown: boolean) => void;
  handleRequestMoveTopNToZone: (zone: string) => void;
  handleRequestShuffleTopN: () => void;
  handleRequestShuffleBottomN: () => void;

  // View the current zoneMenu's zone (deck / grave / exile) — reuses the
  // existing zone-view dialog stack.
  handleRequestViewZone: () => void;

  // Graveyard / Exile actions (sourceZone resolved from current zoneMenu)
  handleRequestMoveAllFromZoneToDeck: (top: boolean) => void;
  handleRequestMoveAllFromZoneTo: (targetZone: string) => void;
  handleRequestRevealRandomFromZone: () => void;

  // Hand context menu action handlers
  handleRequestChooseMulligan: () => void;
  handleRequestRevealHand: () => void;
  handleRequestRevealRandom: () => void;
  handleRequestViewHand: () => void;
  handleRequestSortHandBy: (key: HandSortKey) => void;
  handleRequestMoveHandToDeck: (top: boolean) => void;
  handleRequestMoveHandToZone: (zone: string) => void;
}

export type GameDialogs = GameDialogsState & GameDialogsActions;

export type HandSortKey = 'name' | 'maintype' | 'manacost';

// No-op implementation of the whole action surface, co-located with the type so
// the compiler flags any handler that drifts. Test harnesses compose this with a
// closed-state object to build a complete `GameDialogs` without re-enumerating
// the ~55 callbacks. Tree-shaken out of production bundles.
const noopDialogAction = (): void => undefined;
export const NOOP_GAME_DIALOGS_ACTIONS: GameDialogsActions = {
  closeCardMenu: noopDialogAction,
  closeZoneMenu: noopDialogAction,
  closePlayerMenu: noopDialogAction,
  closeHandMenu: noopDialogAction,
  handleCardContextMenu: noopDialogAction,
  handleZoneContextMenu: noopDialogAction,
  handlePlayerContextMenu: noopDialogAction,
  handleHandContextMenu: noopDialogAction,
  handleZoneClick: noopDialogAction,
  handleCloseZoneView: noopDialogAction,
  closePrompt: noopDialogAction,
  openRollDie: noopDialogAction,
  closeRollDie: noopDialogAction,
  handleRollDieSubmit: noopDialogAction,
  openCreateToken: noopDialogAction,
  closeCreateToken: noopDialogAction,
  handleCreateTokenSubmit: noopDialogAction,
  openSideboard: noopDialogAction,
  closeSideboard: noopDialogAction,
  handleSideboardSubmit: noopDialogAction,
  handleToggleSideboardLock: noopDialogAction,
  openViewSideboard: noopDialogAction,
  closeViewSideboard: noopDialogAction,
  openViewLibrary: noopDialogAction,
  closeViewLibrary: noopDialogAction,
  openViewGraveyard: noopDialogAction,
  closeViewGraveyard: noopDialogAction,
  openGameInfo: noopDialogAction,
  closeGameInfo: noopDialogAction,
  openConcede: noopDialogAction,
  openUnconcede: noopDialogAction,
  closeConcedeConfirm: noopDialogAction,
  confirmConcede: noopDialogAction,
  confirmUnconcede: noopDialogAction,
  openLeaveConfirm: noopDialogAction,
  closeLeaveConfirm: noopDialogAction,
  confirmLeave: noopDialogAction,
  closeReveal: noopDialogAction,
  handleRequestSetPT: noopDialogAction,
  handleRequestSetAnnotation: noopDialogAction,
  handleRequestSetCardCounter: noopDialogAction,
  handleRequestDrawArrow: noopDialogAction,
  handleRequestAttach: noopDialogAction,
  handleRequestPlayFromCardMenu: noopDialogAction,
  handleRequestMoveToLibraryAt: noopDialogAction,
  handleRequestDrawN: noopDialogAction,
  handleRequestDumpN: noopDialogAction,
  handleRequestRevealTopN: noopDialogAction,
  handleRequestRevealZone: noopDialogAction,
  handleRequestUndoDraw: noopDialogAction,
  handleRequestDrawBottom: noopDialogAction,
  handleRequestMoveTopCardToZone: noopDialogAction,
  handleRequestPlayTop: noopDialogAction,
  handleRequestMoveTopNToZone: noopDialogAction,
  handleRequestShuffleTopN: noopDialogAction,
  handleRequestShuffleBottomN: noopDialogAction,
  handleRequestViewZone: noopDialogAction,
  handleRequestMoveAllFromZoneToDeck: noopDialogAction,
  handleRequestMoveAllFromZoneTo: noopDialogAction,
  handleRequestRevealRandomFromZone: noopDialogAction,
  handleRequestChooseMulligan: noopDialogAction,
  handleRequestRevealHand: noopDialogAction,
  handleRequestRevealRandom: noopDialogAction,
  handleRequestViewHand: noopDialogAction,
  handleRequestSortHandBy: noopDialogAction,
  handleRequestMoveHandToDeck: noopDialogAction,
  handleRequestMoveHandToZone: noopDialogAction,
};
