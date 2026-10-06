import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ListImperativeAPI } from 'react-window';
import { Filter, FilterX, Plus, LogIn, Eye, Gavel, ArrowUp, ArrowDown } from 'lucide-react';

import { server, rooms, type GameFilters, type Room, type Game } from '@cockatrice/datatrice';
import { useAppDispatch, useAppSelector } from '@app/store';
import { VirtualRows } from '@app/components';
import { useCanOverrideGameRestrictions, useGridRows, useJoinGame, useJoinGameErrorMessage, useNavigateOnGameJoined } from '@app/hooks';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { CreateGameParams } from '@cockatrice/sockatrice/generated';
import { AlertDialog, PromptDialog } from '@app/dialogs';
import { formatRestrictions, formatSpectators } from '@app/utils';

import CreateGameDialog from '../dialogs/CreateGameDialog/CreateGameDialog';
import FilterGamesDialog from '../dialogs/FilterGamesDialog/FilterGamesDialog';
import { useOpenGames } from './useOpenGames';

const TOOLBAR_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium '
  + 'bg-bg-elevated text-text-secondary hover:text-text-primary border border-border-subtle '
  + 'disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

interface GamesListProps {
  room: Room;
}

// Column definitions kept next to the grid so header labels + sort
// fields stay in sync with what the row cells render. Column widths live in
// GRID_COLS (shared by header and rows) — the body is virtualized with
// react-window, so table layout is replaced by a fixed grid template.
const COLUMNS: Array<{ label: string; field?: string }> = [
  { label: 'Age', field: 'info.startTime' },
  { label: 'Description', field: 'info.description' },
  { label: 'Creator', field: 'info.creatorInfo.name' },
  { label: 'Type', field: 'gameType' },
  { label: 'Restrictions' },
  { label: 'Players' },
  { label: 'Spectators', field: 'info.spectatorsCount' },
];

const GRID_COLS = 'grid grid-cols-[6rem_minmax(0,1fr)_10rem_8rem_14rem_5rem_8rem]';
// px-3 py-2 text-sm cells: 16px padding + 20px line box + 1px bottom border.
const GAME_ROW_HEIGHT = 37;

/**
 * A room's open games, mirroring desktop's GameSelector: a sortable table with
 * single-row selection, a toolbar (filter, create, join, spectate, judge) and
 * the password and join-error dialogs. Rows are a keyboard grid like the
 * QTreeView: ↑/↓/Home/End move the selection, Enter joins like a double-click.
 */
export default function GamesList({ room }: GamesListProps) {
  const roomId = room.info.roomId;
  const webClient = useWebClient();
  const overrideRestrictions = useCanOverrideGameRestrictions();
  const dispatch = useAppDispatch();
  const {
    beginJoin: joinGame,
    passwordRequired,
    submitPassword,
    cancelPassword,
    joinPending,
    joinError,
    clearJoinError,
  } = useJoinGame();
  const joinErrorMessage = useJoinGameErrorMessage(joinError);
  useNavigateOnGameJoined();

  const roomGames = useAppSelector((state) => rooms.Selectors.getRoomGames(state, roomId));
  const activateGame = useCallback((gameId: number) => {
    const game = roomGames[gameId];
    if (game) {
      joinGame(roomId, game.info, false, false);
    }
  }, [roomGames, joinGame, roomId]);
  const { sortBy, games: gameList, selectedGameId, handleSort, handleSelect, handleActivate } =
    useOpenGames({ roomId, onActivateGame: activateGame });
  const selectedGame = selectedGameId != null ? roomGames[selectedGameId] : undefined;
  const counts = useAppSelector((state) => rooms.Selectors.getRoomGameCounts(state, roomId));
  const isFilterActive = useAppSelector((state) => rooms.Selectors.isGameFilterActive(state, roomId));
  const filters = useAppSelector((state) => rooms.Selectors.getGameFilters(state, roomId));
  const isJudgeUser = useAppSelector(server.Selectors.getIsUserJudge);

  const [createOpen, setCreateOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // By id rather than through `selectedGame`: Enter or a double-click selects
  // and joins in one go, before the selection has re-rendered.
  function joinById(gameId: number, asSpectator: boolean, asJudge: boolean) {
    const game = roomGames[gameId];
    if (game) {
      joinGame(roomId, game.info, asSpectator, asJudge);
    }
  }

  function beginJoin(asSpectator: boolean, asJudge: boolean) {
    if (selectedGameId != null) {
      joinById(selectedGameId, asSpectator, asJudge);
    }
  }

  // The body is virtualized, so a keyboard move to a row outside the window
  // scrolls it in; useGridRows focuses it once react-window mounts it.
  const listRef = useRef<ListImperativeAPI>(null);
  const keys = useMemo(() => gameList.map((game) => String(game.info.gameId)), [gameList]);
  const selectRow = useCallback((key: string) => {
    handleSelect(Number(key));
    listRef.current?.scrollToRow({ index: keys.indexOf(key), align: 'smart' });
  }, [handleSelect, keys]);
  const activateRow = useCallback((key: string) => handleActivate(Number(key)), [handleActivate]);
  const { getRowProps, onRowsRendered } = useGridRows({
    keys,
    selectedKey: selectedGameId != null ? String(selectedGameId) : null,
    onSelect: selectRow,
    onActivate: activateRow,
  });

  const canJoin =
    Boolean(selectedGame && (selectedGame.info.playerCount < selectedGame.info.maxPlayers || overrideRestrictions)) && !joinPending;
  const canSpectate = Boolean(selectedGame && (selectedGame.info.spectatorsAllowed || overrideRestrictions)) && !joinPending;

  const handleCreateSubmit = (params: CreateGameParams) => {
    webClient.request.rooms.createGame(roomId, params);
    setCreateOpen(false);
  };

  const handleFilterSubmit = (next: GameFilters) => {
    dispatch(rooms.Actions.setGameFilters({ roomId, filters: next }));
    setFilterOpen(false);
  };

  const sortOrder = sortBy.order.toLowerCase() === 'asc' ? 'asc' : 'desc';

  // Stable renderRow identity (deps are only what changes a row's drawing:
  // selection + the row handlers) so react-window's row memoization holds — see
  // webatrice.instructions.md § Virtualized lists.
  const renderGameRow = useCallback((game: Game, index: number, style: CSSProperties) => {
    const { info, gameType } = game;
    const isSelected = info.gameId === selectedGameId;
    return (
      <div
        key={info.gameId}
        role="row"
        style={style}
        {...getRowProps(String(info.gameId))}
        aria-selected={isSelected}
        // Row 1 is the header; react-window renders only a window of the rest.
        aria-rowindex={index + 2}
        onClick={() => handleSelect(info.gameId)}
        onDoubleClick={() => handleActivate(info.gameId)}
        className={[
          GRID_COLS,
          'cursor-pointer transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
          isSelected
            ? 'bg-accent/20 hover:bg-accent/25'
            : 'hover:bg-bg-elevated',
        ].join(' ')}
      >
        <div role="gridcell" className="px-3 py-2 border-b border-border-subtle/50 text-text-secondary tabular-nums whitespace-nowrap">
          {info.startTime}
        </div>
        <div role="gridcell" className="px-3 py-2 border-b border-border-subtle/50 text-text-primary overflow-hidden">
          <div className="truncate" title={info.description}>{info.description}</div>
        </div>
        <div role="gridcell" className="px-3 py-2 border-b border-border-subtle/50 text-text-secondary overflow-hidden">
          <div className="truncate">{info.creatorInfo?.name ?? ''}</div>
        </div>
        <div role="gridcell" className="px-3 py-2 border-b border-border-subtle/50 text-text-secondary whitespace-nowrap">
          {gameType}
        </div>
        <div role="gridcell" className="px-3 py-2 border-b border-border-subtle/50 text-text-secondary overflow-hidden">
          <div className="truncate">{formatRestrictions(info)}</div>
        </div>
        <div role="gridcell" className="px-3 py-2 border-b border-border-subtle/50 text-text-primary tabular-nums whitespace-nowrap">
          {info.playerCount}/{info.maxPlayers}
        </div>
        <div role="gridcell" className="px-3 py-2 border-b border-border-subtle/50 text-text-secondary overflow-hidden">
          <div className="truncate">{formatSpectators(info)}</div>
        </div>
      </div>
    );
  }, [selectedGameId, getRowProps, handleSelect, handleActivate]);

  return (
    <section className="flex h-full flex-col bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div>
          <h2 className="font-modern text-lg font-semibold text-text-primary">Games in {room.info.name}</h2>
          <p className="text-xs text-text-muted mt-0.5 tabular-nums">
            Showing {counts.visible} / {counts.total}
          </p>
        </div>
      </div>

      {/* Games grid — header fixed above a virtualized row window so a busy
          server's thousands of games cost O(viewport) per delta frame. The
          header and the row scroller both reserve a stable scrollbar gutter so
          their shared GRID_COLS tracks stay aligned once the body overflows
          (the row pane's scrollbar would otherwise narrow the rows vs the
          header). The gutter's track is transparent (thin-scrollbar.css), so
          the header's reserved-but-unused gutter is invisible. */}
      <div
        role="grid"
        aria-label={`Games in ${room.info.name}`}
        aria-rowcount={gameList.length + 1}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <div role="rowgroup" className="shrink-0">
          <div role="row" aria-rowindex={1} className={`${GRID_COLS} bg-bg-elevated text-sm overflow-auto [scrollbar-gutter:stable]`}>
            {COLUMNS.map(({ label, field }) => {
              const active = field === sortBy.field;
              return (
                <div
                  role="columnheader"
                  key={label}
                  aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={[
                    'text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted',
                    'border-b border-border-subtle select-none',
                  ].join(' ')}
                >
                  {field ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-text-primary"
                      onClick={() => handleSort(field)}
                    >
                      {label}
                      {active && (sortOrder === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  ) : (
                    label
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {gameList.length === 0 ? (
          <div className="flex-1 min-h-0 px-4 py-8 text-center text-sm text-text-muted">
            No games open right now — click <span className="text-text-primary">Create</span> to start one.
          </div>
        ) : (
          <div className="flex-1 min-h-0 text-sm">
            <VirtualRows
              items={gameList}
              rowHeight={GAME_ROW_HEIGHT}
              role="rowgroup"
              className="[scrollbar-gutter:stable]"
              renderRow={renderGameRow}
              listRef={listRef}
              onRowsRendered={onRowsRendered}
            />
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border-subtle bg-bg-surface">
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className={[
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            isFilterActive
              ? 'bg-accent text-on-accent hover:bg-accent-hover'
              : 'bg-bg-elevated text-text-secondary hover:text-text-primary border border-border-subtle',
          ].join(' ')}
        >
          <Filter size={14} /> Filter games
        </button>
        <button
          type="button"
          onClick={() => dispatch(rooms.Actions.clearGameFilters({ roomId }))}
          disabled={!isFilterActive}
          className={TOOLBAR_BUTTON_CLASS}
        >
          <FilterX size={14} /> Clear filter
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={[
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm',
            'font-semibold bg-accent text-on-accent hover:bg-accent-hover shadow-glow transition-colors',
          ].join(' ')}
        >
          <Plus size={14} /> Create
        </button>
        <button
          type="button"
          onClick={() => beginJoin(false, false)}
          disabled={!canJoin}
          className={TOOLBAR_BUTTON_CLASS}
        >
          <LogIn size={14} /> Join
        </button>
        <button
          type="button"
          onClick={() => beginJoin(true, false)}
          disabled={!canSpectate}
          className={TOOLBAR_BUTTON_CLASS}
        >
          <Eye size={14} /> Spectate
        </button>
        {isJudgeUser && (
          <>
            <button
              type="button"
              onClick={() => beginJoin(false, true)}
              disabled={!canJoin}
              className={TOOLBAR_BUTTON_CLASS}
            >
              <Gavel size={14} /> Judge
            </button>
            <button
              type="button"
              onClick={() => beginJoin(true, true)}
              disabled={!canSpectate}
              className={TOOLBAR_BUTTON_CLASS}
            >
              <Gavel size={14} /> Judge · Spectate
            </button>
          </>
        )}
      </div>

      {/* Dialogs — kept as-is; a later piece will reskin these too */}
      <CreateGameDialog
        isOpen={createOpen}
        gametypeMap={room.gametypeMap}
        onCancel={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />
      <FilterGamesDialog
        isOpen={filterOpen}
        initialFilters={filters}
        gametypeMap={room.gametypeMap}
        onCancel={() => setFilterOpen(false)}
        onSubmit={handleFilterSubmit}
      />
      <PromptDialog
        isOpen={passwordRequired}
        title="Password required"
        label="Password"
        type="password"
        submitLabel="Join"
        onSubmit={submitPassword}
        onCancel={cancelPassword}
      />
      <AlertDialog
        isOpen={joinError !== null}
        title="Error"
        message={joinErrorMessage}
        onDismiss={clearJoinError}
      />
    </section>
  );
}
