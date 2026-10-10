import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ListImperativeAPI } from 'react-window';
import { Filter, FilterX, Plus, LogIn, Eye, Gavel, ArrowUp, ArrowDown } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { server, rooms, type GameFilters, type Room, type Game } from '@cockatrice/datatrice';
import { useAppDispatch, useAppSelector } from '@app/store';
import { VirtualRows } from '@app/components';
import { useCanOverrideGameRestrictions, useGridRows, useJoinGame, useJoinGameErrorMessage, useNavigateOnGameJoined } from '@app/hooks';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { CreateGameParams } from '@cockatrice/sockatrice/generated';
import { AlertDialog, ConfirmDialog, PromptDialog } from '@app/dialogs';
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

const COLUMNS: Array<{ id: string; field?: string }> = [
  { id: 'age', field: 'info.startTime' },
  { id: 'description', field: 'info.description' },
  { id: 'creator', field: 'info.creatorInfo.name' },
  { id: 'type', field: 'gameType' },
  { id: 'restrictions' },
  { id: 'players' },
  { id: 'spectators', field: 'info.spectatorsCount' },
];

const GRID_COLS = 'grid grid-cols-[6rem_minmax(0,1fr)_10rem_8rem_14rem_5rem_8rem]';
const GAME_ROW_HEIGHT = 37;

export default function GamesList({ room }: GamesListProps) {
  const { t } = useTranslation();
  const roomId = room.info.roomId;
  const webClient = useWebClient();
  const overrideRestrictions = useCanOverrideGameRestrictions();
  const dispatch = useAppDispatch();
  const {
    beginJoin: joinGame,
    passwordRequired,
    submitPassword,
    cancelPassword,
    spectatorConfirmationRequired,
    confirmSpectatorJoin,
    cancelSpectatorJoin,
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
          <div className="truncate">{formatRestrictions(t, info)}</div>
        </div>
        <div role="gridcell" className="px-3 py-2 border-b border-border-subtle/50 text-text-primary tabular-nums whitespace-nowrap">
          {info.playerCount}/{info.maxPlayers}
        </div>
        <div role="gridcell" className="px-3 py-2 border-b border-border-subtle/50 text-text-secondary overflow-hidden">
          <div className="truncate">{formatSpectators(t, info)}</div>
        </div>
      </div>
    );
  }, [t, selectedGameId, getRowProps, handleSelect, handleActivate]);

  return (
    <section className="flex h-full flex-col bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div>
          <h2 className="font-modern text-lg font-semibold text-text-primary">{t('GamesList.heading', { room: room.info.name })}</h2>
          <p className="text-xs text-text-muted mt-0.5 tabular-nums">
            {t('GamesList.showing', { visible: counts.visible, total: counts.total })}
          </p>
        </div>
      </div>

      <div
        role="grid"
        aria-label={t('GamesList.heading', { room: room.info.name })}
        aria-rowcount={gameList.length + 1}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <div role="rowgroup" className="shrink-0">
          <div role="row" aria-rowindex={1} className={`${GRID_COLS} bg-bg-elevated text-sm overflow-auto [scrollbar-gutter:stable]`}>
            {COLUMNS.map(({ id, field }) => {
              const active = field === sortBy.field;
              return (
                <div
                  role="columnheader"
                  key={id}
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
                      {t(`GamesList.column.${id}`)}
                      {active && (sortOrder === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  ) : (
                    t(`GamesList.column.${id}`)
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {gameList.length === 0 ? (
          <div className="flex-1 min-h-0 px-4 py-8 text-center text-sm text-text-muted">
            <Trans i18nKey="GamesList.empty" components={{ create: <span className="text-text-primary" /> }} />
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
          <Filter size={14} /> {t('GamesList.action.filter')}
        </button>
        <button
          type="button"
          onClick={() => dispatch(rooms.Actions.clearGameFilters({ roomId }))}
          disabled={!isFilterActive}
          className={TOOLBAR_BUTTON_CLASS}
        >
          <FilterX size={14} /> {t('GamesList.action.clearFilter')}
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
          <Plus size={14} /> {t('Common.action.create')}
        </button>
        <button
          type="button"
          onClick={() => beginJoin(false, false)}
          disabled={!canJoin}
          className={TOOLBAR_BUTTON_CLASS}
        >
          <LogIn size={14} /> {t('Common.action.join')}
        </button>
        <button
          type="button"
          onClick={() => beginJoin(true, false)}
          disabled={!canSpectate}
          className={TOOLBAR_BUTTON_CLASS}
        >
          <Eye size={14} /> {t('GamesList.action.spectate')}
        </button>
        {isJudgeUser && (
          <>
            <button
              type="button"
              onClick={() => beginJoin(false, true)}
              disabled={!canJoin}
              className={TOOLBAR_BUTTON_CLASS}
            >
              <Gavel size={14} /> {t('GamesList.action.judge')}
            </button>
            <button
              type="button"
              onClick={() => beginJoin(true, true)}
              disabled={!canSpectate}
              className={TOOLBAR_BUTTON_CLASS}
            >
              <Gavel size={14} /> {t('GamesList.action.judgeSpectate')}
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
      <ConfirmDialog
        cancelDefault
        title={t('GameLink.confirm.title')}
        message={t('GameLink.full')}
        confirmLabel={t('GameLink.yes')}
        cancelLabel={t('GameLink.no')}
        isOpen={spectatorConfirmationRequired}
        onConfirm={confirmSpectatorJoin}
        onCancel={cancelSpectatorJoin}
      />
      <PromptDialog
        isOpen={passwordRequired}
        title={t('GamesList.password.title')}
        label={t('Common.label.password')}
        type="password"
        submitLabel={t('Common.action.join')}
        onSubmit={submitPassword}
        onCancel={cancelPassword}
      />
      <AlertDialog
        isOpen={joinError !== null}
        title={t('GamesList.error.title')}
        message={joinErrorMessage}
        onDismiss={clearJoinError}
      />
    </section>
  );
}
