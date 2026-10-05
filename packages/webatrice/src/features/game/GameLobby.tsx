import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Upload,
  Library,
  FastForward,
  LogOut,
  Eye,
  Lock,
  Unlock,
  Undo2,
} from 'lucide-react';

import { AuthGuard } from '@app/components';
import { ConfirmDialog } from '@app/dialogs';
import { Layout } from '@app/feature-wrappers/layout';
import { rooms } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { useBackendDeckList, useLeaveGame } from '@app/hooks';
import { normalizeFormat } from '@app/types';

import { useLobbyDeckSummaries } from './hooks/useLobbyDeckSummaries';
import { useLobbyDeckSelect } from './hooks/useLobbyDeckSelect';
import { groupLobbyDecks, lobbyDeckCategoryLabel } from './components/lobby/lobbyDeckGrouping';
import PlayerRow from './components/lobby/PlayerRow';
import EmptySeat from './components/lobby/EmptySeat';
import BracketBadge from './components/lobby/BracketBadge';
import { useCurrentGame } from './hooks/useCurrentGame';
import ChatLog from './components/ChatLog/ChatLog';
import { GameIdProvider } from './components/ui/GameIdContext';
import GameInviteControls from './components/GameInviteControls/GameInviteControls';
import LobbyDeckView from './components/lobby/LobbyDeckView';
import { useLobbyDeckView } from './components/lobby/useLobbyDeckView';

/**
 * Pre-game lobby. Renders after a player joins a game that hasn't
 * started yet. Superseded fancy webatrice's deck-select modal + wait
 * screen with a persistent full-page view where:
 *
 *   • Every player's seat is visible with their ready + deck state
 *   • The local seat follows desktop's DeckViewContainer states
 *     (deck_view_container.cpp): with no deck loaded it picks one
 *     (from My Decks OR via .cod upload); once the server returns the
 *     deck it shows the deck view with Unload deck / Ready to start /
 *     Sideboard locked|unlocked / Force start (host). The sideboard
 *     plan is edited in the deck view while the sideboard is unlocked
 *     and the player isn't ready. The same view returns between games.
 *
 * Protocol calls used (via sockatrice):
 *   • deckSelect(gameId, { deckId })      — pick from server-stored deck
 *   • deckSelect(gameId, { deck: xml })   — upload a .cod XML string
 *   • readyStart(gameId, { ready })       — toggle self ready
 *   • readyStart(gameId, { ready: true, forceStart: true })
 *                                         — host force start; the server
 *                                           kicks unready players and starts
 *   • setSideboardPlan / setSideboardLock — pre-game sideboarding
 *   • kickFromGame(gameId, { playerId })  — host-only, removes a player
 *   • leaveGame(gameId)                   — self leave
 */

export default function GameLobby({ gameId }: { gameId: number }) {
  const { t } = useTranslation();
  const leaveGame = useLeaveGame();
  const { game, localPlayer, isHost, isSpectator, isJudge } = useCurrentGame(gameId);
  const { backendDecks, isConnected, decks: myDecks } = useBackendDeckList();

  // Room format lookup — first game type in the room's gametypeMap.
  // Cockatrice games can have multiple game types; we prioritise the
  // first one for the "matches this room" hint. Empty string when
  // the room has no gametypes or we can't resolve the room state yet.
  const room = useAppSelector((state) =>
    game ? rooms.Selectors.getRoom(state, game.info.roomId) : undefined,
  );
  const roomFormatLabel = useMemo(() => {
    if (!room || !game?.info.gameTypes.length) {
      return '';
    }
    for (const id of game.info.gameTypes) {
      const label = room.gametypeMap[id];
      if (label) {
        return label;
      }
    }
    return '';
  }, [room, game?.info.gameTypes]);
  const roomFormatSlug = useMemo(() => normalizeFormat(roomFormatLabel), [roomFormatLabel]);

  const { summaryByDeckId, bracketByDeckId, stillLoadingFormats } = useLobbyDeckSummaries(myDecks, isConnected);
  const groupedDecks = useMemo(
    () => groupLobbyDecks(myDecks, summaryByDeckId, roomFormatSlug),
    [myDecks, summaryByDeckId, roomFormatSlug],
  );
  const {
    fileInputRef, uploadError, handleFilePicked, myPickedDeckId, deckSelectError, handleSelectDeck,
    forceStartConfirmOpen, setForceStartConfirmOpen, confirmForceStart, kickPlayer,
  } = useLobbyDeckSelect(gameId);
  const deckView = useLobbyDeckView(gameId);

  const myBracket = myPickedDeckId != null ? bracketByDeckId.get(myPickedDeckId) : undefined;
  const myDeckName =
    myPickedDeckId != null ? summaryByDeckId.get(myPickedDeckId)?.name : undefined;

  const seatedPlayers = useMemo(() => {
    if (!game) {
      return [];
    }
    return game.seatOrder
      .map((id) => game.players[id])
      .filter((p): p is NonNullable<typeof p> =>
        !!p && !p.properties.spectator && !p.properties.judge,
      );
  }, [game]);

  // Reconnect / stale-state guard. The lobby is only meaningful for
  // pre-started games where we have a local player row on the wire.
  if (!game) {
    return (
      <Layout>
        <AuthGuard />
        <div className="h-full flex items-center justify-center bg-bg-base bg-purple-radial">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 size={16} className="animate-spin text-accent" /> {t('GameLobby.loadingGame')}
          </div>
        </div>
      </Layout>
    );
  }

  const totalSeats = game.info.maxPlayers || seatedPlayers.length;
  const emptySeats = Math.max(0, totalSeats - seatedPlayers.length);
  const iAmSeated = !!localPlayer && !isSpectator && !isJudge;

  return (
    <Layout>
      <AuthGuard />
      <GameIdProvider value={gameId}>
        <div className="h-full flex bg-bg-base bg-purple-radial" data-testid="game-lobby">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-xl mx-auto py-10 px-6 flex flex-col gap-8">
              {/* Header */}
              <div className="text-center">
                <h1 className="font-modern text-2xl font-semibold text-text-primary">
                  {game.info.description || t('GameLobby.gameNumber', { id: gameId })}
                </h1>
                {roomFormatLabel && (
                  <p className="text-sm text-text-muted mt-1">{roomFormatLabel}</p>
                )}
                <GameInviteControls gameId={gameId} className="justify-center mt-3" />
              </div>

              {/* Players */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-text-muted text-center">
                  {t('BattlefieldSidebar.players')}
                </div>
                {seatedPlayers.map((p) => {
                  const isLocalPlayer = p.properties.playerId === game.localPlayerId;
                  return (
                    <PlayerRow
                      key={p.properties.playerId}
                      playerName={p.properties.userInfo?.name || t('GameLog.player.number', { id: p.properties.playerId })}
                      isHost={p.properties.playerId === game.hostId}
                      ready={p.properties.readyStart}
                      hasDeck={!!p.properties.deckHash}
                      // Bracket + deck-name are only known for the local
                      // player today (see the comment on myPickedDeckId
                      // above for the Cockatrice protocol reason).
                      // Remote players fall back to "Deck submitted".
                      bracket={
                        isLocalPlayer && !!p.properties.deckHash ? myBracket : undefined
                      }
                      deckName={
                        isLocalPlayer && !!p.properties.deckHash ? myDeckName : undefined
                      }
                      showKick={isHost && !isLocalPlayer}
                      onKick={() => kickPlayer(p.properties.playerId)}
                    />
                  );
                })}
                {Array.from({ length: emptySeats }).map((_, i) => (
                  <EmptySeat key={`empty-${i}`} />
                ))}
              </div>

              {/* Deck selection — desktop's deck-select state: seated, no deck loaded */}
              {iAmSeated && !deckView.deckLoaded && (
                <div className="border-t border-border-strong pt-6 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-text-muted text-center">
                    {t('GameLobby.deck.heading')}
                  </div>
                  {deckSelectError && (
                    <div
                      role="alert"
                      className={[
                        'flex items-start gap-2 text-xs text-danger',
                        'bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1',
                      ].join(' ')}
                    >
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                      <span>{deckSelectError}</span>
                    </div>
                  )}

                  <div className="rounded-lg bg-bg-surface border border-border-subtle overflow-hidden">
                    <div
                      className={[
                        'px-4 py-2 border-b border-border-subtle flex items-center gap-2',
                        'text-xs font-semibold uppercase tracking-widest text-text-secondary',
                      ].join(' ')}
                    >
                      <Library size={13} /> {t('GameLobby.fromMyDecks')}
                      {stillLoadingFormats && myDecks.length > 0 && (
                        <Loader2 size={11} className="animate-spin text-text-muted ml-auto" />
                      )}
                    </div>
                    {!backendDecks ? (
                      <div className="px-4 py-6 flex items-center gap-2 text-sm text-text-muted justify-center">
                        <Loader2 size={14} className="animate-spin" /> {t('GameLobby.loadingDecks')}
                      </div>
                    ) : myDecks.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-text-muted italic text-center">
                        {t('GameLobby.noDecks')}
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto">
                        {groupedDecks.map(({ category, decks }) => {
                          return (
                            <div key={category}>
                              <div
                                className={[
                                  'sticky top-0 z-10 px-4 py-1.5 bg-bg-elevated border-b border-border-subtle',
                                  'text-[10px] font-semibold uppercase tracking-widest text-text-muted flex items-center gap-2',
                                ].join(' ')}
                              >
                                <span>{lobbyDeckCategoryLabel(category, t)}</span>
                                <span className="text-text-muted tabular-nums">{decks.length}</span>
                              </div>
                              <ul className="divide-y divide-border-subtle/50">
                                {decks.map((deck) => {
                                  const bracket = bracketByDeckId.get(deck.id);
                                  return (
                                    <li key={deck.id}>
                                      <button
                                        type="button"
                                        onClick={() => handleSelectDeck(deck.id)}
                                        className={[
                                          'w-full flex items-center gap-2 px-4 py-2',
                                          'hover:bg-bg-elevated text-sm text-text-primary transition-colors text-left',
                                        ].join(' ')}
                                      >
                                        <span className="flex-1 min-w-0 truncate">{deck.name}</span>
                                        {bracket != null && <BracketBadge level={bracket} />}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg bg-bg-surface border border-border-subtle p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-secondary mb-2">
                      <Upload size={13} /> {t('GameLobby.upload.heading')}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".cod,application/xml,text/xml"
                      onChange={(e) => {
                        handleFilePicked(e.target.files?.[0] ?? null);
                        // Reset so re-uploading the same file re-triggers change.
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={[
                        'w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5',
                        'rounded-md border border-border-strong bg-bg-elevated',
                        'hover:bg-border-subtle text-text-primary text-sm font-medium transition-colors',
                      ].join(' ')}
                    >
                      <Upload size={13} /> {t('DeckSelectDialog.chooseFile')}
                    </button>
                    {uploadError && (
                      <div
                        className={[
                          'mt-2 flex items-start gap-2 text-xs text-danger',
                          'bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1',
                        ].join(' ')}
                      >
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>{uploadError}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Deck-loaded state: deck view + desktop's DeckViewContainer button row */}
              {iAmSeated && deckView.deckLoaded && deckView.view && (
                <div className="border-t border-border-strong pt-6 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-text-muted text-center">
                    {t('GameLobby.deck.heading')}
                  </div>
                  <LobbyDeckView
                    view={deckView.view}
                    editable={deckView.editable}
                    onMoveCard={deckView.moveCard}
                  />
                  <div className="flex items-center gap-2 justify-center flex-wrap">
                    <button type="button" onClick={deckView.unloadDeck} className={LOBBY_BUTTON_CLASS}>
                      <Undo2 size={14} /> {t('GameLobby.action.unloadDeck')}
                    </button>
                    {/* Desktop's ToggleButton: green frame when on, red when off. */}
                    <button
                      type="button"
                      onClick={deckView.toggleReady}
                      aria-pressed={deckView.ready}
                      className={[LOBBY_BUTTON_CLASS, deckView.ready ? TOGGLE_ON_CLASS : TOGGLE_OFF_CLASS].join(' ')}
                    >
                      <CheckCircle2 size={14} /> {t('GameLobby.action.readyStart')}
                    </button>
                    <button
                      type="button"
                      onClick={deckView.toggleSideboardLock}
                      disabled={deckView.ready}
                      className={[
                        LOBBY_BUTTON_CLASS,
                        deckView.sideboardLocked ? TOGGLE_OFF_CLASS : TOGGLE_ON_CLASS,
                      ].join(' ')}
                    >
                      {deckView.sideboardLocked ? <Lock size={14} /> : <Unlock size={14} />}
                      {deckView.sideboardLocked
                        ? t('GameLobby.action.sideboardLocked')
                        : t('GameLobby.action.sideboardUnlocked')}
                    </button>
                    {isHost && (
                      <button
                        type="button"
                        onClick={() => setForceStartConfirmOpen(true)}
                        className={[LOBBY_BUTTON_CLASS, 'text-warning'].join(' ')}
                      >
                        <FastForward size={14} /> {t('GameLobby.action.forceStart')}
                      </button>
                    )}
                  </div>
                  {deckView.sideboardLocked && !deckView.ready && (
                    <p className="text-xs text-text-muted text-center">{t('GameLobby.deck.lockedHint')}</p>
                  )}
                </div>
              )}

              {iAmSeated && (
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => leaveGame(gameId)}
                    className={[
                      'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-text-secondary',
                      'hover:text-danger hover:bg-red-500/10 border border-border-subtle transition-colors',
                    ].join(' ')}
                  >
                    <LogOut size={14} /> {t('ShortcutsTab.action.game.leaveGame')}
                  </button>
                </div>
              )}

              {/* Spectator / judge notice — no deck, no ready. */}
              {!iAmSeated && (
                <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
                  <Eye size={14} />
                  {isJudge ? t('GameLobby.watching.judge') : t('GameLobby.watching.spectator')}
                  <button
                    type="button"
                    onClick={() => leaveGame(gameId)}
                    className={[
                      'ml-4 flex items-center gap-1 px-3 py-1 rounded-md text-xs',
                      'font-medium text-text-secondary hover:text-danger',
                      'hover:bg-red-500/10 border border-border-subtle transition-colors',
                    ].join(' ')}
                  >
                    <LogOut size={12} /> {t('BattlefieldSidebar.leave')}
                  </button>
                </div>
              )}

            </div>
          </div>
          {/* Persistent chat log — the shared ChatLog component (same one
             the in-game sidebar renders) so lobby chat, deck-select
             announcements, and ready-up announcements land in the
             same message list players will continue to see once the
             game starts. */}
          <aside className="hidden md:flex w-80 shrink-0 border-l border-border-strong flex-col bg-bg-base p-3">
            <ChatLog />
          </aside>
        </div>
        <ConfirmDialog
          isOpen={forceStartConfirmOpen}
          title={t('GameLobby.forceStart.title')}
          message={t('GameLobby.forceStart.message')}
          confirmLabel={t('GameLink.yes')}
          cancelLabel={t('GameLink.no')}
          onConfirm={confirmForceStart}
          onCancel={() => setForceStartConfirmOpen(false)}
        />
      </GameIdProvider>
    </Layout>
  );
}

const LOBBY_BUTTON_CLASS = [
  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors',
  'bg-bg-elevated hover:bg-border-subtle text-text-primary border-2 border-border-strong',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ');
const TOGGLE_ON_CLASS = 'border-emerald-500/70';
const TOGGLE_OFF_CLASS = 'border-red-500/60';
