import { useCallback, useMemo, useState } from 'react';

import { DEFAULT_DIE_COUNT, DEFAULT_DIE_SIDES } from '../../dialogs/RollDieDialog/RollDieDialog';
import type {
  AnchorPosition,
  CardMenuState,
  ConcedeConfirm,
  CreateTokenRequest,
  GameDialogsActions,
  MoveTopUntilState,
  GameDialogsState,
  PromptState,
  RevealState,
  SeatCardMenuState,
  ZoneMenuState,
  ZoneViewTarget,
} from './gameDialogs.types';

/** The state setters the domain action hooks open and close dialogs with. */
export interface GameDialogSetters {
  setZoneViews: React.Dispatch<React.SetStateAction<ZoneViewTarget[]>>;
  setCardMenu: React.Dispatch<React.SetStateAction<CardMenuState | null>>;
  setSeatCardMenu: React.Dispatch<React.SetStateAction<SeatCardMenuState | null>>;
  setZoneMenu: React.Dispatch<React.SetStateAction<ZoneMenuState | null>>;
  setHandMenu: React.Dispatch<React.SetStateAction<AnchorPosition | null>>;
  setPrompt: React.Dispatch<React.SetStateAction<PromptState | null>>;
  setRollDieOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLastDieSides: React.Dispatch<React.SetStateAction<number>>;
  setLastDieCount: React.Dispatch<React.SetStateAction<number>>;
  setCreateTokenRequest: React.Dispatch<React.SetStateAction<CreateTokenRequest | null>>;
  setRevealState: React.Dispatch<React.SetStateAction<RevealState | null>>;
  setConcedeConfirm: React.Dispatch<React.SetStateAction<ConcedeConfirm>>;
  setLeaveConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}

/** The plain open/close actions: each sets one flag and nothing else. */
export type GameDialogToggleActions = Pick<
  GameDialogsActions,
  | 'closeCardMenu'
  | 'closeSeatCardMenu'
  | 'closeZoneMenu'
  | 'closeHandMenu'
  | 'openPrompt'
  | 'closePrompt'
  | 'openMoveTopUntil'
  | 'closeMoveTopUntil'
  | 'openRollDie'
  | 'closeRollDie'
  | 'openCreateToken'
  | 'closeCreateToken'
  | 'openGameInfo'
  | 'closeGameInfo'
  | 'openConcede'
  | 'openUnconcede'
  | 'closeConcedeConfirm'
  | 'openLeaveConfirm'
  | 'closeLeaveConfirm'
  | 'closeReveal'
>;

export interface GameDialogStateHandle {
  state: GameDialogsState;
  set: GameDialogSetters;
  toggles: GameDialogToggleActions;
  /** The open create-token request (its seed and submitter), or null. */
  createTokenRequest: CreateTokenRequest | null;
  /** Closes every context menu, the seats' card menus included. Each menu
   *  opener calls it first, so at most one in-game context menu is open at a time. */
  closeAllContextMenus: () => void;
}

/** Owns every open/closed flag and payload behind `GameDialogs`. */
export function useGameDialogState(): GameDialogStateHandle {
  const [zoneViews, setZoneViews] = useState<ZoneViewTarget[]>([]);
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null);
  const [seatCardMenu, setSeatCardMenu] = useState<SeatCardMenuState | null>(null);
  const [zoneMenu, setZoneMenu] = useState<ZoneMenuState | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [moveTopUntil, setMoveTopUntil] = useState<MoveTopUntilState | null>(null);
  const [rollDieOpen, setRollDieOpen] = useState(false);
  const [lastDieSides, setLastDieSides] = useState(DEFAULT_DIE_SIDES);
  const [lastDieCount, setLastDieCount] = useState(DEFAULT_DIE_COUNT);
  const [createTokenRequest, setCreateTokenRequest] = useState<CreateTokenRequest | null>(null);
  const createTokenOpen = createTokenRequest != null;
  const createTokenInitial = createTokenRequest?.initial ?? null;
  const [revealState, setRevealState] = useState<RevealState | null>(null);
  const [handMenu, setHandMenu] = useState<AnchorPosition | null>(null);
  const [concedeConfirm, setConcedeConfirm] = useState<ConcedeConfirm>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [gameInfoOpen, setGameInfoOpen] = useState(false);

  const closeAllContextMenus = useCallback(() => {
    setCardMenu(null);
    setSeatCardMenu(null);
    setZoneMenu(null);
    setHandMenu(null);
  }, []);

  // React's setters are stable, so these are too.
  const set = useMemo<GameDialogSetters>(() => ({
    setZoneViews,
    setCardMenu,
    setSeatCardMenu,
    setZoneMenu,
    setHandMenu,
    setPrompt,
    setRollDieOpen,
    setLastDieSides,
    setLastDieCount,
    setCreateTokenRequest,
    setRevealState,
    setConcedeConfirm,
    setLeaveConfirm,
  }), []);

  const toggles = useMemo<GameDialogToggleActions>(() => ({
    closeCardMenu: () => setCardMenu(null),
    closeSeatCardMenu: () => setSeatCardMenu(null),
    closeZoneMenu: () => setZoneMenu(null),
    closeHandMenu: () => setHandMenu(null),
    openPrompt: (next) => setPrompt({
      ...next,
      onSubmit: (value) => {
        next.onSubmit(value);
        setPrompt(null);
      },
    }),
    closePrompt: () => setPrompt(null),
    openMoveTopUntil: (next) => setMoveTopUntil({
      onSubmit: (request) => {
        next.onSubmit(request);
        setMoveTopUntil(null);
      },
    }),
    closeMoveTopUntil: () => setMoveTopUntil(null),
    openRollDie: () => setRollDieOpen(true),
    closeRollDie: () => setRollDieOpen(false),
    openCreateToken: (request) => setCreateTokenRequest({ ...request }),
    closeCreateToken: () => setCreateTokenRequest(null),
    openGameInfo: () => setGameInfoOpen(true),
    closeGameInfo: () => setGameInfoOpen(false),
    openConcede: () => setConcedeConfirm('concede'),
    openUnconcede: () => setConcedeConfirm('unconcede'),
    closeConcedeConfirm: () => setConcedeConfirm(null),
    openLeaveConfirm: () => setLeaveConfirm(true),
    closeLeaveConfirm: () => setLeaveConfirm(false),
    closeReveal: () => setRevealState(null),
  }), []);

  const state = useMemo<GameDialogsState>(
    () => ({
      cardMenu,
      seatCardMenu,
      zoneMenu,
      handMenu,
      zoneViews,
      prompt,
      moveTopUntil,
      rollDieOpen,
      lastDieSides,
      lastDieCount,
      createTokenOpen,
      createTokenInitial,
      gameInfoOpen,
      concedeConfirm,
      leaveConfirm,
      revealState,
    }),
    [
      cardMenu,
      seatCardMenu,
      zoneMenu,
      handMenu,
      zoneViews,
      prompt,
      moveTopUntil,
      rollDieOpen,
      lastDieSides,
      lastDieCount,
      createTokenOpen,
      createTokenInitial,
      gameInfoOpen,
      concedeConfirm,
      leaveConfirm,
      revealState,
    ],
  );

  return { state, set, toggles, closeAllContextMenus, createTokenRequest };
}
