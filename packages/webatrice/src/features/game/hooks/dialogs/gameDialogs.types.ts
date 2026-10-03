import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';

import type { CreateTokenSubmit } from '../../dialogs/CreateTokenDialog/CreateTokenDialog';
import type { MoveTopUntilRequest } from '../useMoveTopUntil';
import type { SideboardPlanMove } from '../../dialogs/SideboardDialog/SideboardDialog';

// The game dialog and menu contract. `useGameDialogs` is the façade that builds
// it; the hooks beside this file each own one domain of it.

export interface AnchorPosition {
  top: number;
  left: number;
}

/**
 * One open zone view (desktop ZoneViewWidget): a player's zone and, for a
 * hidden zone, how much of it the view dumps.
 */
export interface ZoneViewTarget {
  playerId: number;
  zoneName: string;
  /** Cards from the top the view shows (`-1` or absent: the whole zone). */
  numberCards?: number;
  /** With `numberCards`: count from the bottom instead. */
  isReversed?: boolean;
}

export interface CardMenuState {
  card: ServerInfo_Card;
  sourcePlayerId: number;
  sourceZone: string;
  anchorPosition: AnchorPosition;
}

/**
 * A card menu opened on a seat: the battlefield, stack, hand or zone-view card
 * it belongs to and where it opens. `pile` is a graveyard / exile view card,
 * `zoneView` a library / sideboard view card (desktop's hand-or-custom-zone
 * menu). The seat builds the items from its live state and renders them
 * through `CardMenuPopup`; keeping the open menu here makes it one of the
 * game's mutually exclusive context menus.
 */
export type SeatCardMenuState =
  | { kind: 'battlefield' | 'stack' | 'hand'; playerId: number; cardId: string; x: number; y: number }
  | {
    kind: 'pile' | 'zoneView';
    playerId: number;
    zone: string;
    cardId: string;
    cardName: string;
    x: number;
    y: number;
    /** The zone view's cards, in display order, that Select All picks. */
    viewCardIds: string[];
    /** The right-clicked card's column (group) in the view, for Select Column. */
    columnCardIds: string[];
  };

export interface ZoneMenuState {
  playerId: number;
  zoneName: string;
  anchorPosition: AnchorPosition;
}

/** The game's one text prompt, rendered by the root PromptDialog (see its props). */
export interface PromptState {
  title: string;
  label: string;
  initialValue?: string;
  helperText?: string;
  description?: string;
  placeholder?: string;
  submitLabel?: string;
  type?: 'text' | 'number';
  inputMode?: 'text' | 'numeric';
  selectOnFocus?: boolean;
  preview?: (value: string) => string | null;
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
}

/**
 * Who opened the create-token dialog. A seat seeds it with its last token
 * and creates the token through its own card port (so "Create another
 * token" can repeat it); without a request the dialog uses the game's
 * Command_CreateToken defaults.
 */
export interface CreateTokenRequest {
  initial?: CreateTokenSubmit | null;
  onSubmit?: (token: CreateTokenSubmit) => void;
}

/** The open "Put top cards on stack until…" dialog: the seat's loop to start. */
export interface MoveTopUntilState {
  onSubmit: (request: MoveTopUntilRequest) => void;
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
  seatCardMenu: SeatCardMenuState | null;
  zoneMenu: ZoneMenuState | null;
  playerMenu: AnchorPosition | null;
  handMenu: AnchorPosition | null;
  zoneViews: ZoneViewTarget[];
  prompt: PromptState | null;
  moveTopUntil: MoveTopUntilState | null;
  rollDieOpen: boolean;
  lastDieSides: number;
  lastDieCount: number;
  createTokenOpen: boolean;
  /** The values the create-token dialog opens with; null for blank. */
  createTokenInitial: CreateTokenSubmit | null;
  sideboardOpen: boolean;
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
  openSeatCardMenu: (menu: SeatCardMenuState) => void;
  closeSeatCardMenu: () => void;
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
  /** Opens a zone view (see ZoneViewTarget), dumping a local hidden zone. */
  openZoneView: (view: ZoneViewTarget) => void;
  handleZoneClick: (playerId: number, zoneName: string) => void;
  handleCloseZoneView: (playerId: number, zoneName: string, shuffleOnClose?: boolean) => void;

  // Prompt dialog
  /** Opens the prompt; it closes itself after `onSubmit` runs. */
  openPrompt: (prompt: PromptState) => void;
  closePrompt: () => void;

  // "Put top cards on stack until…" dialog
  /** Opens the dialog; it closes itself after `onSubmit` runs. */
  openMoveTopUntil: (dialog: MoveTopUntilState) => void;
  closeMoveTopUntil: () => void;

  // Roll die dialog
  openRollDie: () => void;
  closeRollDie: () => void;
  handleRollDieSubmit: (args: { sides: number; count: number }) => void;

  // Token / sideboard / game info / concede
  openCreateToken: (request?: CreateTokenRequest) => void;
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

  /** Open the local seat's own sideboard / library / graveyard view. */
  openViewSideboard: () => void;
  openViewLibrary: () => void;
  openViewGraveyard: () => void;

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
  openSeatCardMenu: noopDialogAction,
  closeSeatCardMenu: noopDialogAction,
  closeZoneMenu: noopDialogAction,
  closePlayerMenu: noopDialogAction,
  closeHandMenu: noopDialogAction,
  handleCardContextMenu: noopDialogAction,
  handleZoneContextMenu: noopDialogAction,
  handlePlayerContextMenu: noopDialogAction,
  handleHandContextMenu: noopDialogAction,
  openZoneView: noopDialogAction,
  handleZoneClick: noopDialogAction,
  handleCloseZoneView: noopDialogAction,
  openPrompt: noopDialogAction,
  closePrompt: noopDialogAction,
  openMoveTopUntil: noopDialogAction,
  closeMoveTopUntil: noopDialogAction,
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
  openViewLibrary: noopDialogAction,
  openViewGraveyard: noopDialogAction,
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
