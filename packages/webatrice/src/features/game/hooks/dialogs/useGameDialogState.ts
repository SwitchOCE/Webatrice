import { useCallback, useMemo, useState } from 'react';

import { DEFAULT_DIE_COUNT, DEFAULT_DIE_SIDES } from '../../dialogs/RollDieDialog/RollDieDialog';
import type {
  AnchorPosition,
  CardMenuState,
  ConcedeConfirm,
  GameDialogsActions,
  GameDialogsState,
  PromptState,
  RevealState,
  ZoneMenuState,
  ZoneViewTarget,
} from './gameDialogs.types';

/** The state setters the domain action hooks open and close dialogs with. */
export interface GameDialogSetters {
  setZoneViews: React.Dispatch<React.SetStateAction<ZoneViewTarget[]>>;
  setCardMenu: React.Dispatch<React.SetStateAction<CardMenuState | null>>;
  setZoneMenu: React.Dispatch<React.SetStateAction<ZoneMenuState | null>>;
  setPlayerMenu: React.Dispatch<React.SetStateAction<AnchorPosition | null>>;
  setHandMenu: React.Dispatch<React.SetStateAction<AnchorPosition | null>>;
  setPrompt: React.Dispatch<React.SetStateAction<PromptState | null>>;
  setRollDieOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLastDieSides: React.Dispatch<React.SetStateAction<number>>;
  setLastDieCount: React.Dispatch<React.SetStateAction<number>>;
  setCreateTokenOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSideboardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRevealState: React.Dispatch<React.SetStateAction<RevealState | null>>;
  setConcedeConfirm: React.Dispatch<React.SetStateAction<ConcedeConfirm>>;
  setLeaveConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}

/** The plain open/close actions: each sets one flag and nothing else. */
export type GameDialogToggleActions = Pick<
  GameDialogsActions,
  | 'closeCardMenu'
  | 'closeZoneMenu'
  | 'closePlayerMenu'
  | 'closeHandMenu'
  | 'closePrompt'
  | 'openRollDie'
  | 'closeRollDie'
  | 'openCreateToken'
  | 'closeCreateToken'
  | 'openSideboard'
  | 'closeSideboard'
  | 'openViewSideboard'
  | 'closeViewSideboard'
  | 'openViewLibrary'
  | 'closeViewLibrary'
  | 'openViewGraveyard'
  | 'closeViewGraveyard'
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
  /** Closes every context menu. Each menu opener calls it first, so at most
   *  one in-game context menu is open at a time. */
  closeAllContextMenus: () => void;
}

/** Owns every open/closed flag and payload behind `GameDialogs`. */
export function useGameDialogState(): GameDialogStateHandle {
  const [zoneViews, setZoneViews] = useState<ZoneViewTarget[]>([]);
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null);
  const [zoneMenu, setZoneMenu] = useState<ZoneMenuState | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [rollDieOpen, setRollDieOpen] = useState(false);
  const [lastDieSides, setLastDieSides] = useState(DEFAULT_DIE_SIDES);
  const [lastDieCount, setLastDieCount] = useState(DEFAULT_DIE_COUNT);
  const [createTokenOpen, setCreateTokenOpen] = useState(false);
  const [sideboardOpen, setSideboardOpen] = useState(false);
  const [viewSideboardOpen, setViewSideboardOpen] = useState(false);
  const [viewLibraryOpen, setViewLibraryOpen] = useState(false);
  const [viewGraveyardOpen, setViewGraveyardOpen] = useState(false);
  const [revealState, setRevealState] = useState<RevealState | null>(null);
  const [playerMenu, setPlayerMenu] = useState<AnchorPosition | null>(null);
  const [handMenu, setHandMenu] = useState<AnchorPosition | null>(null);
  const [concedeConfirm, setConcedeConfirm] = useState<ConcedeConfirm>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [gameInfoOpen, setGameInfoOpen] = useState(false);

  const closeAllContextMenus = useCallback(() => {
    setCardMenu(null);
    setZoneMenu(null);
    setPlayerMenu(null);
    setHandMenu(null);
  }, []);

  // React's setters are stable, so these are too.
  const set = useMemo<GameDialogSetters>(() => ({
    setZoneViews,
    setCardMenu,
    setZoneMenu,
    setPlayerMenu,
    setHandMenu,
    setPrompt,
    setRollDieOpen,
    setLastDieSides,
    setLastDieCount,
    setCreateTokenOpen,
    setSideboardOpen,
    setRevealState,
    setConcedeConfirm,
    setLeaveConfirm,
  }), []);

  const toggles = useMemo<GameDialogToggleActions>(() => ({
    closeCardMenu: () => setCardMenu(null),
    closeZoneMenu: () => setZoneMenu(null),
    closePlayerMenu: () => setPlayerMenu(null),
    closeHandMenu: () => setHandMenu(null),
    closePrompt: () => setPrompt(null),
    openRollDie: () => setRollDieOpen(true),
    closeRollDie: () => setRollDieOpen(false),
    openCreateToken: () => setCreateTokenOpen(true),
    closeCreateToken: () => setCreateTokenOpen(false),
    openSideboard: () => setSideboardOpen(true),
    closeSideboard: () => setSideboardOpen(false),
    openViewSideboard: () => setViewSideboardOpen(true),
    closeViewSideboard: () => setViewSideboardOpen(false),
    openViewLibrary: () => setViewLibraryOpen(true),
    closeViewLibrary: () => setViewLibraryOpen(false),
    openViewGraveyard: () => setViewGraveyardOpen(true),
    closeViewGraveyard: () => setViewGraveyardOpen(false),
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
      zoneMenu,
      playerMenu,
      handMenu,
      zoneViews,
      prompt,
      rollDieOpen,
      lastDieSides,
      lastDieCount,
      createTokenOpen,
      sideboardOpen,
      viewSideboardOpen,
      viewLibraryOpen,
      viewGraveyardOpen,
      gameInfoOpen,
      concedeConfirm,
      leaveConfirm,
      revealState,
    }),
    [
      cardMenu,
      zoneMenu,
      playerMenu,
      handMenu,
      zoneViews,
      prompt,
      rollDieOpen,
      lastDieSides,
      lastDieCount,
      createTokenOpen,
      sideboardOpen,
      viewSideboardOpen,
      viewLibraryOpen,
      viewGraveyardOpen,
      gameInfoOpen,
      concedeConfirm,
      leaveConfirm,
      revealState,
    ],
  );

  return { state, set, toggles, closeAllContextMenus };
}
