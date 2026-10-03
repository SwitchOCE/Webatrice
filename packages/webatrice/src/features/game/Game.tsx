import { ReactNode, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';

import { AuthGuard } from '@app/components';
import { usePhaseTrackPinned } from '@app/hooks';
import { Layout } from '@app/feature-wrappers/layout';
import { ConfirmDialog, PromptDialog } from '@app/dialogs';
import GameLobby from './GameLobby';
import GameErrorBoundary from './GameErrorBoundary';
import { useCurrentGame } from './hooks/useCurrentGame';
import { usePlaymatSync } from './hooks/usePlaymatSync';
import GameArrowOverlay from './components/arrows/GameArrowOverlay/GameArrowOverlay';
import BoxSelectOverlay from './components/ui/BoxSelectOverlay/BoxSelectOverlay';
import CardContextMenu from './components/context-menus/CardContextMenu/CardContextMenu';
import HandContextMenu from './components/context-menus/HandContextMenu/HandContextMenu';
import PlayerContextMenu from './components/context-menus/PlayerContextMenu/PlayerContextMenu';
import ZoneContextMenu from './components/context-menus/ZoneContextMenu/ZoneContextMenu';
import PhaseTrack from './components/PhaseTrack/PhaseTrack';
import BattlefieldSidebar from './components/BattlefieldSidebar/BattlefieldSidebar';
import SidebarResizer from './components/SidebarResizer/SidebarResizer';
import { useSidebarWidth } from './hooks/useSidebarWidth';
import { CardDragOverlayHost } from './components/ui/CardDragOverlay/CardDragOverlay';
import GameBoardCell from './components/ui/GameBoardCell/GameBoardCell';
import { BigCardPreview } from './components/PlayerBox/bigCardPreview';
import { CardScaleProvider } from './components/PlayerBox/cardScale';
import IncomingRevealDialog from './components/PlayerBox/IncomingRevealDialog';
import { ForeignDragProvider } from './components/PlayerBox/foreignDragContext';
import CreateTokenDialog from './dialogs/CreateTokenDialog/CreateTokenDialog';
import DeckSelectDialog from './dialogs/DeckSelectDialog/DeckSelectDialog';
import GameInfoDialog from './dialogs/GameInfoDialog/GameInfoDialog';
import RevealCardsDialog from './dialogs/RevealCardsDialog/RevealCardsDialog';
import RollDieDialog from './dialogs/RollDieDialog/RollDieDialog';
import SideboardDialog from './dialogs/SideboardDialog/SideboardDialog';
import ZoneViewDialog from './dialogs/ZoneViewDialog/ZoneViewDialog';
import { useGame } from './hooks/useGame';
import { CardRegistryContext } from './utils/CardRegistry/CardRegistryContext';
import { GameInteractionProvider } from './components/ui/GameInteractionContext';
import { CardVisualStateProvider } from './components/ui/CardVisualStateContext';
import { GameDialogActionsProvider } from './components/ui/GameDialogActionsContext';
import { GameIdProvider } from './components/ui/GameIdContext';
import { CardPreviewProvider } from './components/ui/CardPreviewContext';
import { SeatShortcutsProvider } from './components/ui/SeatShortcutsContext';
import { GameSelectionProvider } from './components/ui/GameSelectionContext';
import { ActiveSeatDragProvider } from './components/ui/SeatDragContext';
import { GameDialogsProvider } from './components/ui/GameDialogsContext';
import { useGameReadOnly } from './components/ui/GameReadOnlyContext';

import './Game.css';

const CONCEDE_CONFIRM_MESSAGE =
  'You\'ll stay seated as a spectator until you click Unconcede or Leave Game. Others will see you as conceded.';

const LEAVE_CONFIRM_MESSAGE =
  'You\'ll be removed from the game entirely. To rejoin, you\'ll need a re-invite or to join as a spectator (if allowed).';

/**
 * Top-level game route. Splits the render into two paths:
 *   • Pre-start (game exists but `started === false`): the full-page
 *     GameLobby handles deck selection, ready toggling, and host
 *     force-start (via kick).
 *   • Started: the existing battlefield renders below in GameBoard.
 * The gate lives outside useGame() so the heavy game infra (DND
 * sensors, card registry, board layout memoization, arrow overlay)
 * doesn't initialize while we're still lobbying — cheap since
 * useCurrentGame is just a couple of Redux selectors.
 */
function Game() {
  const params = useParams<{ gameId?: string }>();
  const parsed = params.gameId != null ? Number(params.gameId) : NaN;
  const routeGameId = Number.isFinite(parsed) ? parsed : undefined;
  const { game, isStarted } = useCurrentGame(routeGameId);
  // Lives above the lobby/board switch: decks are selected in the lobby and
  // the round-robin cursor advances when a game ends.
  usePlaymatSync(routeGameId);

  return (
    <GameErrorBoundary gameId={routeGameId}>
      {game && !isStarted && routeGameId != null ? <GameLobby gameId={routeGameId} /> : <GameBoard />}
    </GameErrorBoundary>
  );
}

// Replay mode swallows every press and click on the board grid in the capture
// phase, so no card, zone or player control can send a command or apply an
// optimistic update; hover still reaches the cards for the preview pane. Keys
// are left alone: the board's keyboard handlers are window-level and gated on
// owning a seat, and the replay shortcuts listen on the window too.
function swallowBoardInput(event: React.SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

const READ_ONLY_BOARD_GUARD = {
  onPointerDownCapture: swallowBoardInput,
  onMouseDownCapture: swallowBoardInput,
  onClickCapture: swallowBoardInput,
  onDoubleClickCapture: swallowBoardInput,
  onContextMenuCapture: swallowBoardInput,
  onDragStartCapture: swallowBoardInput,
};

const noop = () => {};

export interface GameBoardProps {
  /** Game to render; defaults to the `/game/:gameId` route param. */
  gameId?: number;
  /** Chrome rendered as a full-width row under the board (the replay timeline). */
  footer?: ReactNode;
  /** Replaces the sidebar's Leave action (a replay closes instead of leaving). */
  onLeave?: () => void;
}

/**
 * The battlefield for a game. Inside a `GameReadOnlyProvider` (replay playback)
 * it renders the same board as a spectator would see, with every way to act on
 * the game removed.
 */
export function GameBoard({ gameId: boardGameId, footer, onLeave }: GameBoardProps = {}) {
  const readOnly = useGameReadOnly();
  const g = useGame({ gameId: boardGameId, readOnly });
  const {
    gameId,
    game,
    boardRef,
    gameRef,
    cardRegistry,
    sensors,
    previewStore,
    seatShortcuts,
    setHoveredCard,
    selectedCardKeys,
    setSelectedCardKeys,
    onCardFocus,
    onCardBlur,
    handleGameMouseDown,
    boxSelectPreview,
    layout,
    arrows,
    dialogs,
    dnd,
  } = g;

  // Persisted width for the right rail. `.game` reads it via the
  // `--sidebar-width` CSS variable set inline below; SidebarResizer
  // commits new values via `setSidebarWidth` from its pointer-move.
  const { width: sidebarWidth, setWidth: setSidebarWidth } = useSidebarWidth();
  // Pinned mode grows the phase-track column from 8 px (HUD default)
  // to 112 px so the always-expanded PhaseTrack takes real width
  // instead of floating over the play area.
  const phaseTrackPinned = usePhaseTrackPinned();
  const phaseTrackColumnWidth = phaseTrackPinned ? 112 : 8;

  const interactionHandlers = useMemo(
    () => (readOnly
      ? {
        onCardHover: setHoveredCard,
        onCardFocus,
        onCardBlur,
        onCardClick: noop,
        onCardContextMenu: noop,
        onCardDoubleClick: noop,
        onZoneClick: noop,
        onZoneContextMenu: noop,
      }
      : {
        onCardHover: setHoveredCard,
        onCardFocus,
        onCardBlur,
        onCardClick: arrows.handleCardClick,
        onCardContextMenu: dialogs.handleCardContextMenu,
        onCardDoubleClick: arrows.handleCardDoubleClick,
        onZoneClick: dialogs.handleZoneClick,
        onZoneContextMenu: dialogs.handleZoneContextMenu,
      }),
    [
      readOnly,
      setHoveredCard,
      onCardFocus,
      onCardBlur,
      arrows.handleCardClick,
      arrows.handleCardDoubleClick,
      dialogs.handleCardContextMenu,
      dialogs.handleZoneClick,
      dialogs.handleZoneContextMenu,
    ],
  );

  // Maps each seated playerId to its canAct, reusing the layout's per-cell value
  // (the local seat in bottomHand carries the same computeCanAct result, so the
  // bottom hand bar resolves correctly too). Stable across arrow drags so
  // canActFor-only consumers don't re-render on every drag tick.
  const canActFor = useMemo(() => {
    const byPlayerId = new Map(layout.cells.map((cell) => [cell.playerId, cell.canAct]));
    return (playerId: number) => byPlayerId.get(playerId) ?? false;
  }, [layout.cells]);

  // Dialog/confirm-opening actions surfaced by the TurnControls sidebar. Provided
  // via context so RightPanel (which doesn't use them) needn't forward them.
  const dialogActions = useMemo(
    () => (readOnly
      ? {
        onRequestRollDie: noop,
        onRequestConcede: noop,
        onRequestUnconcede: noop,
        onRequestGameInfo: noop,
        onRequestViewSideboard: noop,
        onRequestLeave: onLeave ?? noop,
      }
      : {
        onRequestRollDie: dialogs.openRollDie,
        onRequestConcede: dialogs.openConcede,
        onRequestUnconcede: dialogs.openUnconcede,
        onRequestGameInfo: dialogs.openGameInfo,
        onRequestViewSideboard: dialogs.openViewSideboard,
        onRequestLeave: onLeave ?? dialogs.openLeaveConfirm,
      }),
    [
      readOnly,
      onLeave,
      dialogs.openRollDie,
      dialogs.openConcede,
      dialogs.openUnconcede,
      dialogs.openGameInfo,
      dialogs.openViewSideboard,
      dialogs.openLeaveConfirm,
    ],
  );

  return (
    <Layout>
      {!readOnly && <AuthGuard />}
      <CardRegistryContext.Provider value={cardRegistry}>
        <GameIdProvider value={gameId}>
          <CardPreviewProvider store={previewStore}>
            <SeatShortcutsProvider registry={seatShortcuts}>
              <GameSelectionProvider selectedCardKeys={selectedCardKeys} setSelectedCardKeys={setSelectedCardKeys}>
                <ForeignDragProvider>
                  <CardScaleProvider containerRef={boardRef} rows={layout.rows}>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={dnd.collisionDetection}
                      onDragStart={dnd.handleDragStart}
                      onDragEnd={dnd.handleDragEnd}
                      onDragCancel={dnd.handleDragCancel}
                    >
                      <ActiveSeatDragProvider value={dnd.activeSeatDrag}>
                        <GameInteractionProvider value={interactionHandlers}>
                          <CardVisualStateProvider
                            arrowSourceKey={arrows.arrowSourceKey}
                            arrowTargetKey={arrows.arrowTargetKey}
                            selectedCardKeys={selectedCardKeys}
                            canActFor={canActFor}
                          >
                            <GameDialogActionsProvider value={dialogActions}>
                              <GameDialogsProvider value={dialogs}>
                                <div
                                  className={footer ? 'game game--with-footer' : 'game'}
                                  data-testid="game-container"
                                  data-readonly={readOnly || undefined}
                                  ref={gameRef}
                                  onMouseDown={readOnly ? undefined : handleGameMouseDown}
                                  style={{
                                    '--sidebar-width': `${sidebarWidth}px`,
                                    '--phase-track-width': `${phaseTrackColumnWidth}px`,
                                  } as React.CSSProperties}
                                >
                                  <PhaseTrack />

                                  {/* Grid-column-1 placeholder — only rendered
                               when PhaseTrack is in its default floating
                               (position: absolute) mode. In pinned mode
                               the PhaseTrack itself is `position:
                               relative` and consumes column 1, so a
                               placeholder here would displace every
                               other cell one column to the right. */}
                                  {!phaseTrackPinned && <div aria-hidden />}

                                  <div
                                    className="game__board"
                                    ref={boardRef}
                                    onMouseDown={arrows.handleBoardMouseDown}
                                    {...(readOnly ? READ_ONLY_BOARD_GUARD : undefined)}
                                  >
                                    {!game && (
                                      <div className="game__empty" data-testid="game-empty">
                    No active game. Join a game from a room to see the board.
                                      </div>
                                    )}

                                    {game && layout.cells.length > 0 && (
                                      <div
                                        className="game__board-grid"
                                        style={{
                                          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                                          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
                                        }}
                                      >
                                        {layout.cells.map((cell) => (
                                          <GameBoardCell
                                            key={cell.playerId}
                                            cell={cell}
                                            totalPlayers={layout.cells.length}
                                          />
                                        ))}
                                      </div>
                                    )}
                                    {/* Bottom-bar HandZone removed: each PlayerBox now
                                renders its own hand inline. Kept the space so
                                downstream layout hooks that watched the empty
                                bottom bar don't recompute their heights. */}
                                  </div>

                                  <SidebarResizer width={sidebarWidth} onResize={setSidebarWidth} />

                                  <BattlefieldSidebar />

                                  <GameArrowOverlay containerRef={gameRef} dragPreview={arrows.dragPreview} />

                                  <BoxSelectOverlay preview={boxSelectPreview} />

                                  {!readOnly && <DeckSelectDialog />}

                                  {dialogs.zoneViews.map((v, idx) => (
                                    <ZoneViewDialog
                                      key={`${v.playerId}-${v.zoneName}`}
                                      isOpen
                                      playerId={v.playerId}
                                      zoneName={v.zoneName}
                                      handleClose={(shuffleOnClose) => dialogs.handleCloseZoneView(v.playerId, v.zoneName, shuffleOnClose)}
                                      initialPosition={{ x: 80 + idx * 36, y: 80 + idx * 36 }}
                                    />
                                  ))}

                                  <CardContextMenu />

                                  <ZoneContextMenu />

                                  <PlayerContextMenu />

                                  <HandContextMenu />

                                  {dialogs.prompt && (
                                    <PromptDialog
                                      isOpen
                                      title={dialogs.prompt.title}
                                      label={dialogs.prompt.label}
                                      initialValue={dialogs.prompt.initialValue}
                                      helperText={dialogs.prompt.helperText}
                                      validate={dialogs.prompt.validate}
                                      onSubmit={dialogs.prompt.onSubmit}
                                      onCancel={dialogs.closePrompt}
                                    />
                                  )}

                                  <RollDieDialog />

                                  <CreateTokenDialog />

                                  <SideboardDialog />

                                  <RevealCardsDialog />

                                  {/* Receiver-side popup: opens whenever an
                              Event_RevealCards arrives with a populated
                              card list (someone revealed a zone to us,
                              or "to all players" including us). Reads /
                              dismisses via the incomingReveal slice. */}
                                  {!readOnly && <IncomingRevealDialog />}

                                  <ConfirmDialog
                                    isOpen={dialogs.concedeConfirm === 'concede'}
                                    title="Concede this game?"
                                    message={CONCEDE_CONFIRM_MESSAGE}
                                    confirmLabel="Concede"
                                    destructive
                                    onConfirm={dialogs.confirmConcede}
                                    onCancel={dialogs.closeConcedeConfirm}
                                  />

                                  <ConfirmDialog
                                    isOpen={dialogs.concedeConfirm === 'unconcede'}
                                    title="Rejoin the game?"
                                    message="This undoes your concede and puts you back into the active player rotation."
                                    confirmLabel="Unconcede"
                                    onConfirm={dialogs.confirmUnconcede}
                                    onCancel={dialogs.closeConcedeConfirm}
                                  />

                                  <ConfirmDialog
                                    isOpen={dialogs.leaveConfirm}
                                    title="Leave this game?"
                                    message={LEAVE_CONFIRM_MESSAGE}
                                    confirmLabel="Leave"
                                    destructive
                                    onConfirm={dialogs.confirmLeave}
                                    onCancel={dialogs.closeLeaveConfirm}
                                  />

                                  <GameInfoDialog />


                                  {footer && <div className="game__footer">{footer}</div>}
                                </div>
                              </GameDialogsProvider>
                            </GameDialogActionsProvider>
                          </CardVisualStateProvider>
                        </GameInteractionProvider>
                      </ActiveSeatDragProvider>

                      <CardDragOverlayHost />
                    </DndContext>
                  </CardScaleProvider>
                </ForeignDragProvider>
                <BigCardPreview />
              </GameSelectionProvider>
            </SeatShortcutsProvider>
          </CardPreviewProvider>
        </GameIdProvider>
      </CardRegistryContext.Provider>
    </Layout>
  );
}

export default Game;
