import { RefObject, useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSensor, useSensors } from '@dnd-kit/core';

import { usePreference } from '@app/hooks';
import { createCardPreviewStore, type CardPreviewStore } from '../components/ui/CardPreviewContext';
import { createSeatShortcutRegistry, type SeatShortcutRegistry } from '../components/ui/SeatShortcutsContext';
import { useMoveCard } from '../components/ui/GameBoardCell/useMoveCard';
import { GamePointerSensor } from './gamePointerSensor';
import { createCardRegistry, type CardRegistry } from '../utils/CardRegistry/CardRegistryContext';
import { useCurrentGame, type CurrentGame } from './useCurrentGame';
import { useGameAccess, type GameAccess } from './useGameAccess';
import { useGameArrowInteractions, type GameArrowInteractions } from './useGameArrowInteractions';
import { useGameBoxSelection, type BoxSelectPreview } from './useGameBoxSelection';
import { useGameDialogs, type GameDialogs } from './useGameDialogs';
import { useGameDnd, type GameDnd } from './useGameDnd';
import { useJudgeTarget } from './useJudgeTarget';
import { useGameLifecycleNavigation } from './useGameLifecycleNavigation';
import { useGameBoardLayout, type GameBoardLayout, type RotationStep } from './useGameBoardLayout';
import { useGameSelection, type GameSelection } from './useGameSelection';
import { useGameShortcuts } from './useGameShortcuts';

export interface Game extends CurrentGame {
  boardRef: RefObject<HTMLDivElement>;
  gameRef: RefObject<HTMLDivElement>;
  cardRegistry: CardRegistry;
  sensors: ReturnType<typeof useSensors>;
  /** The game's one card-preview owner (hover, keyboard focus, zoom). */
  previewStore: CardPreviewStore;
  /** Seat-scoped shortcut operations the local seat publishes. */
  seatShortcuts: SeatShortcutRegistry;
  selectedCardKeys: ReadonlySet<string>;
  setSelectedCardKeys: GameSelection['setSelectedCardKeys'];
  handleGameMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  boxSelectPreview: BoxSelectPreview | null;
  localAccess: GameAccess;
  layout: GameBoardLayout;
  /** Turns the board view one seat around the table; local only (desktop playerRotation). */
  rotateView: (step: RotationStep) => void;
  arrows: GameArrowInteractions;
  dialogs: GameDialogs;
  dnd: GameDnd;
}

export interface UseGameOptions {
  /** Game to drive; defaults to the `/game/:gameId` route param. */
  gameId?: number;
  /** Replay playback: no drag sensors and no kicked/closed/left navigation. */
  readOnly?: boolean;
}

const NO_SENSORS: ReturnType<typeof useSensors> = [];

export function useGame({ gameId: boardGameId, readOnly = false }: UseGameOptions = {}): Game {
  const params = useParams<{ gameId?: string }>();
  const parsed = params.gameId != null ? Number(params.gameId) : NaN;
  const routeGameId = Number.isFinite(parsed) ? parsed : undefined;
  const current = useCurrentGame(boardGameId ?? routeGameId);
  const { gameId, game, isSpectator } = current;

  // A replay ends with its recorded Event_GameClosed; that must not bounce the
  // viewer to the lobby like a live game closing does.
  useGameLifecycleNavigation(readOnly ? undefined : gameId);

  const boardRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const cardRegistry = useMemo(() => createCardRegistry(), []);
  // See .github/instructions/webatrice-game.instructions.md#pointer--click-vs-drag.
  // Pointer only: seat drags hand dnd-kit just their pointerdown, so a
  // keyboard sensor never activated. The keyboard moves cards through the
  // card menu's "Move to" and the zone shortcuts instead.
  const sensors = useSensors(useSensor(GamePointerSensor, { activationDistance: 0 }));
  const previewStore = useMemo(() => createCardPreviewStore(), []);
  const seatShortcuts = useMemo(() => createSeatShortcutRegistry(), []);
  const selection = useGameSelection();

  // Desktop keeps the view rotation per game scene and never persists it.
  const [rotation, setRotation] = useState({ gameId, steps: 0 });
  const rotationSteps = rotation.gameId === gameId ? rotation.steps : 0;
  const rotateView = useCallback(
    (step: RotationStep) => setRotation((r) => ({ gameId, steps: (r.gameId === gameId ? r.steps : 0) + step })),
    [gameId],
  );
  const layout = useGameBoardLayout(game, rotationSteps, usePreference('minPlayersForMultiColumnLayout'));
  const localAccess = useGameAccess(gameId, game?.localPlayerId);
  const judgeTarget = useJudgeTarget(gameId);

  const arrows = useGameArrowInteractions({
    gameId,
    containerRef: gameRef,
    cardRegistry,
  });
  const box = useGameBoxSelection({
    selectedCardKeys: selection.selectedCardKeys,
    setSelectedCardKeys: selection.setSelectedCardKeys,
    clearSelection: selection.clearSelection,
    pendingActive: arrows.pending,
  });
  const dialogs = useGameDialogs({ gameId, isSpectator });
  const moveCard = useMoveCard(gameId);
  const dnd = useGameDnd({
    gameId,
    judgeTarget,
    cancelPendingArrow: arrows.cancelPendingOnDragStart,
    clearSelection: selection.clearSelection,
    moveCard,
  });

  useGameShortcuts({
    gameId,
    seatShortcuts,
    onRotateView: rotateView,
    onRequestConcede: dialogs.openConcede,
    onRequestDrawMultiple: dialogs.handleRequestDrawN,
    onRequestUndoDraw: dialogs.handleRequestUndoDraw,
    onRequestRollDie: dialogs.openRollDie,
    onRequestLeave: dialogs.openLeaveConfirm,
    onRequestViewSideboard: dialogs.openViewSideboard,
    onRequestSortHandByType: () => dialogs.handleRequestSortHandBy('maintype'),
    onRequestViewLibrary: dialogs.openViewLibrary,
    onRequestViewGraveyard: dialogs.openViewGraveyard,
    onRequestPlayTop: () => dialogs.handleRequestPlayTop(false),
    onRequestMoveTopToGrave: () => dialogs.handleRequestMoveTopCardToZone('grave'),
    onRequestMoveTopNToGrave: () => dialogs.handleRequestMoveTopNToZone('grave'),
    // Esc close-recent-view: pops the topmost zone-view dialog if any
    // exist. Returns whether it actually consumed the keystroke so the
    // shortcut handler can decide to preventDefault or fall through.
    onCloseRecentZoneView: () => {
      const top = dialogs.zoneViews[dialogs.zoneViews.length - 1];
      if (!top) {
        return false;
      }
      dialogs.handleCloseZoneView(top.playerId, top.zoneName);
      return true;
    },
  });

  return {
    ...current,
    boardRef,
    gameRef,
    cardRegistry,
    sensors: readOnly ? NO_SENSORS : sensors,
    previewStore,
    seatShortcuts,
    selectedCardKeys: selection.selectedCardKeys,
    setSelectedCardKeys: selection.setSelectedCardKeys,
    handleGameMouseDown: box.handleGameMouseDown,
    boxSelectPreview: box.previewRect,
    localAccess,
    layout,
    rotateView,
    arrows,
    dialogs,
    dnd,
  };
}
