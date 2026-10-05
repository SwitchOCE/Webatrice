import type { CreateTokenSubmit } from '../../dialogs/CreateTokenDialog/CreateTokenDialog';
import type { MoveTopUntilRequest } from '../useMoveTopUntil';

// The game dialog and menu contract. `useGameDialogs` is the façade that builds
// it; the hooks beside this file each own one domain of it.


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


/**
 * A card menu opened on a seat: the battlefield, stack, hand or zone-view card
 * it belongs to and where it opens. `pile` is a graveyard / exile view card,
 * `zoneView` a library / sideboard view card (desktop's hand-or-custom-zone
 * menu). The seat builds the items from its live state and renders them
 * through `ContextMenuPopup`; keeping the open menu here makes it one of the
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


export type ConcedeConfirm = 'concede' | 'unconcede' | null;


// The dialogs slice splits into STATE (the open/closed flags + payloads that
// change as the user opens/closes dialogs) and ACTIONS (the stable open/close/
// request callbacks). Keeping them as separate types lets the hook return, the
// `GameDialogs` contract, and the test harness's no-op default all derive from
// one source instead of hand-syncing ~70 fields in three places. `GameDialogs`
// (their intersection) stays the single type every consumer reads.
export interface GameDialogsState {
  seatCardMenu: SeatCardMenuState | null;
  zoneViews: ZoneViewTarget[];
  prompt: PromptState | null;
  moveTopUntil: MoveTopUntilState | null;
  rollDieOpen: boolean;
  lastDieSides: number;
  lastDieCount: number;
  createTokenOpen: boolean;
  /** The values the create-token dialog opens with; null for blank. */
  createTokenInitial: CreateTokenSubmit | null;
  gameInfoOpen: boolean;
  concedeConfirm: ConcedeConfirm;
  /** True while the leave-game confirmation dialog is open. Mirrors
   *  `concedeConfirm` — same guard-rail pattern for a destructive
   *  action, so accidental clicks on the sidebar Leave button don't
   *  drop the user out of a game they meant to stay in. */
  leaveConfirm: boolean;
}

export interface GameDialogsActions {
  // The seats' card menus (one open at a time)
  openSeatCardMenu: (menu: SeatCardMenuState) => void;
  closeSeatCardMenu: () => void;

  // Zone-view dialog stack
  /** Opens a zone view (see ZoneViewTarget), dumping a local hidden zone. */
  openZoneView: (view: ZoneViewTarget) => void;
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

  // Library and hand actions behind the game shortcuts and the hand menu
  handleRequestDrawN: () => void;
  handleRequestUndoDraw: () => void;
  handleRequestMoveTopCardToZone: (zone: string, options?: { x?: number }) => void;
  handleRequestPlayTop: (faceDown: boolean) => void;
  handleRequestMoveTopNToZone: (zone: string) => void;
  handleRequestChooseMulligan: () => void;
  handleRequestSortHandBy: (key: HandSortKey) => void;
}

export type GameDialogs = GameDialogsState & GameDialogsActions;

export type HandSortKey = 'name' | 'maintype' | 'manacost';

// No-op implementation of the whole action surface, co-located with the type so
// the compiler flags any handler that drifts. Test harnesses compose this with a
// closed-state object to build a complete `GameDialogs` without re-enumerating
// the ~55 callbacks. Tree-shaken out of production bundles.
const noopDialogAction = (): void => undefined;
export const NOOP_GAME_DIALOGS_ACTIONS: GameDialogsActions = {
  openSeatCardMenu: noopDialogAction,
  closeSeatCardMenu: noopDialogAction,
  openZoneView: noopDialogAction,
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
  handleRequestDrawN: noopDialogAction,
  handleRequestUndoDraw: noopDialogAction,
  handleRequestMoveTopCardToZone: noopDialogAction,
  handleRequestPlayTop: noopDialogAction,
  handleRequestMoveTopNToZone: noopDialogAction,
  handleRequestChooseMulligan: noopDialogAction,
  handleRequestSortHandBy: noopDialogAction,
};
