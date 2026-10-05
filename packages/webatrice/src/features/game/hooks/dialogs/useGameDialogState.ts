import { useMemo, useState } from 'react';

import { DEFAULT_DIE_COUNT, DEFAULT_DIE_SIDES } from '../../dialogs/RollDieDialog/RollDieDialog';
import type {
  ConcedeConfirm,
  CreateTokenRequest,
  GameDialogsActions,
  MoveTopUntilState,
  GameDialogsState,
  PromptState,
  SeatCardMenuState,
  ZoneViewTarget,
} from './gameDialogs.types';

/** The state setters the domain action hooks open and close dialogs with. */
export interface GameDialogSetters {
  setZoneViews: React.Dispatch<React.SetStateAction<ZoneViewTarget[]>>;
  setPrompt: React.Dispatch<React.SetStateAction<PromptState | null>>;
  setRollDieOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLastDieSides: React.Dispatch<React.SetStateAction<number>>;
  setLastDieCount: React.Dispatch<React.SetStateAction<number>>;
  setCreateTokenRequest: React.Dispatch<React.SetStateAction<CreateTokenRequest | null>>;
  setConcedeConfirm: React.Dispatch<React.SetStateAction<ConcedeConfirm>>;
  setLeaveConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}

/** The plain open/close actions: each sets one flag and nothing else. */
export type GameDialogToggleActions = Pick<
  GameDialogsActions,
  | 'openSeatCardMenu'
  | 'closeSeatCardMenu'
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
>;

export interface GameDialogStateHandle {
  state: GameDialogsState;
  set: GameDialogSetters;
  toggles: GameDialogToggleActions;
  /** The open create-token request (its seed and submitter), or null. */
  createTokenRequest: CreateTokenRequest | null;
}

/** Owns every open/closed flag and payload behind `GameDialogs`. */
export function useGameDialogState(): GameDialogStateHandle {
  const [zoneViews, setZoneViews] = useState<ZoneViewTarget[]>([]);
  // One seat card menu at a time: opening another replaces it.
  const [seatCardMenu, setSeatCardMenu] = useState<SeatCardMenuState | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [moveTopUntil, setMoveTopUntil] = useState<MoveTopUntilState | null>(null);
  const [rollDieOpen, setRollDieOpen] = useState(false);
  const [lastDieSides, setLastDieSides] = useState(DEFAULT_DIE_SIDES);
  const [lastDieCount, setLastDieCount] = useState(DEFAULT_DIE_COUNT);
  const [createTokenRequest, setCreateTokenRequest] = useState<CreateTokenRequest | null>(null);
  const createTokenOpen = createTokenRequest != null;
  const createTokenInitial = createTokenRequest?.initial ?? null;
  const [concedeConfirm, setConcedeConfirm] = useState<ConcedeConfirm>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [gameInfoOpen, setGameInfoOpen] = useState(false);

  // React's setters are stable, so these are too.
  const set = useMemo<GameDialogSetters>(() => ({
    setZoneViews,
    setPrompt,
    setRollDieOpen,
    setLastDieSides,
    setLastDieCount,
    setCreateTokenRequest,
    setConcedeConfirm,
    setLeaveConfirm,
  }), []);

  const toggles = useMemo<GameDialogToggleActions>(() => ({
    openSeatCardMenu: (menu) => setSeatCardMenu(menu),
    closeSeatCardMenu: () => setSeatCardMenu(null),
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
  }), []);

  const state = useMemo<GameDialogsState>(
    () => ({
      seatCardMenu,
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
    }),
    [
      seatCardMenu,
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
    ],
  );

  return { state, set, toggles, createTokenRequest };
}
