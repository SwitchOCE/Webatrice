import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';

import { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import {
  createCardPreviewStore,
  previewCardFromServerCard,
  type CardPreviewStore,
} from '../components/ui/CardPreviewContext';
import { createSeatShortcutRegistry, type SeatShortcutRegistry } from '../components/ui/SeatShortcutsContext';
import { useMoveCard } from '../components/ui/GameBoardCell/useMoveCard';
import { GamePointerSensor } from './gamePointerSensor';
import { createCardRegistry, type CardRegistry } from '../utils/CardRegistry/CardRegistryContext';
import { resolveSelectedCards, type SelectedCard } from '../utils/selection';
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
  /** Publishes a structured leaf's hovered server card to the preview store. */
  setHoveredCard: (card: ServerInfo_Card | null) => void;
  selectedCardKeys: ReadonlySet<string>;
  setSelectedCardKeys: GameSelection['setSelectedCardKeys'];
  selectedCards: readonly SelectedCard[];
  onCardFocus: (ownerPlayerId: number | undefined, zone: string | undefined, card: ServerInfo_Card) => void;
  onCardBlur: (ownerPlayerId: number | undefined, zone: string | undefined, card: ServerInfo_Card) => void;
  collapseUnlessSelected: GameSelection['collapseUnlessSelected'];
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

export function useGame(): Game {
  const params = useParams<{ gameId?: string }>();
  const parsed = params.gameId != null ? Number(params.gameId) : NaN;
  const routeGameId = Number.isFinite(parsed) ? parsed : undefined;
  const current = useCurrentGame(routeGameId);
  const { gameId, game, isSpectator } = current;

  useGameLifecycleNavigation(gameId);

  const boardRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const cardRegistry = useMemo(() => createCardRegistry(), []);
  // See .github/instructions/webatrice-game.instructions.md#pointer--click-vs-drag.
  const sensors = useSensors(
    useSensor(GamePointerSensor, { activationDistance: 0 }),
    useSensor(KeyboardSensor),
  );
  const previewStore = useMemo(() => createCardPreviewStore(), []);
  const seatShortcuts = useMemo(() => createSeatShortcutRegistry(), []);
  const setHoveredCard = useCallback(
    (card: ServerInfo_Card | null) => previewStore.setHoveredCard(previewCardFromServerCard(card)),
    [previewStore],
  );
  const selection = useGameSelection();
  // Keyboard focus wins over hover in the preview pane.
  const focusedCard = selection.focused?.card;
  useEffect(() => {
    previewStore.setFocusedCard(previewCardFromServerCard(focusedCard));
  }, [previewStore, focusedCard]);
  const selectedCards = useMemo(
    () => (game ? resolveSelectedCards(game, selection.selectedCardKeys) : []),
    [game, selection.selectedCardKeys],
  );
  // Call-time getter for the live selection. Lets the dialog/dnd hooks read the
  // current multi-selection without taking `selectedCards` as a dep (which would
  // churn their memoized callbacks on every selection change). Mirrors the
  // readGame/readLocalPlayer store-read pattern in useGameDialogs.
  const selectedCardsRef = useRef(selectedCards);
  selectedCardsRef.current = selectedCards;
  const getSelectedCards = useCallback(() => selectedCardsRef.current, []);

  // Desktop keeps the view rotation per game scene and never persists it.
  const [rotation, setRotation] = useState({ gameId, steps: 0 });
  const rotationSteps = rotation.gameId === gameId ? rotation.steps : 0;
  const rotateView = useCallback(
    (step: RotationStep) => setRotation((r) => ({ gameId, steps: (r.gameId === gameId ? r.steps : 0) + step })),
    [gameId],
  );
  const layout = useGameBoardLayout(game, rotationSteps);
  const localAccess = useGameAccess(gameId, game?.localPlayerId);
  const judgeTarget = useJudgeTarget(gameId);

  const arrows = useGameArrowInteractions({
    gameId,
    game,
    containerRef: gameRef,
    cardRegistry,
    selectedCards,
    collapseUnlessSelected: selection.collapseUnlessSelected,
  });
  const box = useGameBoxSelection({
    selectedCardKeys: selection.selectedCardKeys,
    setSelectedCardKeys: selection.setSelectedCardKeys,
    clearSelection: selection.clearSelection,
    clearFocused: selection.clearFocused,
    pendingActive: arrows.pending,
  });
  const dialogs = useGameDialogs({
    gameId,
    localAccess,
    isSpectator,
    startPendingArrow: arrows.startPendingArrow,
    startPendingAttach: arrows.startPendingAttach,
    collapseUnlessSelected: selection.collapseUnlessSelected,
    getSelectedCards,
  });
  const moveCard = useMoveCard(gameId);
  const dnd = useGameDnd({
    gameId,
    judgeTarget,
    cancelPendingArrow: arrows.cancelPendingOnDragStart,
    collapseUnlessSelected: selection.collapseUnlessSelected,
    getSelectedCards,
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
    sensors,
    previewStore,
    seatShortcuts,
    setHoveredCard,
    selectedCardKeys: selection.selectedCardKeys,
    setSelectedCardKeys: selection.setSelectedCardKeys,
    selectedCards,
    onCardFocus: selection.onCardFocus,
    onCardBlur: selection.onCardBlur,
    collapseUnlessSelected: selection.collapseUnlessSelected,
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
