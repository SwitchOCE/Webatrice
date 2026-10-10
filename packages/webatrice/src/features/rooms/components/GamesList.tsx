import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ListImperativeAPI } from 'react-window';
import { ArrowDown, ArrowUp, Gavel, Info, Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { games as gamesSlice, server, rooms, type Room, type Game } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { Menu, MenuItem, MenuSeparator, VirtualRows, type MenuAnchor } from '@app/components';
import { useCanOverrideGameRestrictions, useGridRows, useJoinGame, useJoinGameErrorMessage, useNavigateOnGameJoined } from '@app/hooks';
import { AlertDialog, ConfirmDialog } from '@app/dialogs';

import RoomGameInfoDialog from '../dialogs/RoomGameInfoDialog/RoomGameInfoDialog';
import GameRow, { gameName, type RowAction } from './GameRow';
import PasswordPopover from './PasswordPopover';
import QuickFilterBar, { SORT_KEYS } from './QuickFilterBar';
import { rowJoinState, type RowJoinState } from './gameRowModel';
import { currentSortOption, SORT_OPTIONS, type SortOptionId } from './quickFilters';
import { useElementWidth } from './useElementWidth';
import { useGameLink } from './useGameLink';
import { useNowSeconds } from './useNowSeconds';
import { useOpenGames } from './useOpenGames';
import { useRoomGameFilters } from './useRoomGameFilters';

interface GamesListProps {
  room: Room;
  header?: ReactNode;
}

const ROW_HEIGHT_FALLBACK = 40;
const WATCHING_MIN_WIDTH = 760;
const PASSWORD_TOGGLE_MIN_WIDTH = 980;
const COLUMNS_WIDE = 'minmax(0,1fr) 116px 92px 216px';
const COLUMNS_NARROW = 'minmax(0,1fr) 116px 216px';

function rowHeight(): number {
  const raw = typeof window === 'undefined'
    ? ''
    : getComputedStyle(document.documentElement).getPropertyValue('--row-h');
  const parsed = Number.parseFloat(raw);
  return Math.round((Number.isFinite(parsed) && parsed > 0 ? parsed : ROW_HEIGHT_FALLBACK) * 1.5);
}

interface PendingTrigger {
  gameId: number;
  action: RowAction;
  button: HTMLElement;
}

interface MoreMenu {
  gameId: number;
  anchor: MenuAnchor;
  button: HTMLElement;
}

export default function GamesList({ room, header }: GamesListProps) {
  const { t } = useTranslation();
  const roomId = room.info.roomId;
  const overrideRestrictions = useCanOverrideGameRestrictions();
  const {
    beginJoin,
    passwordRequired,
    passwordGame,
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
  const activeGameIds = useAppSelector(gamesSlice.Selectors.getActiveGameIds);
  const isJudgeUser = useAppSelector(server.Selectors.getIsUserJudge);
  const roomFilters = useRoomGameFilters(roomId);
  const nowSeconds = useNowSeconds();
  const gameLink = useGameLink();
  const [measureRef, width, section] = useElementWidth<HTMLElement>();
  const watchingColumn = width >= WATCHING_MIN_WIDTH;
  const passwordInBar = width >= PASSWORD_TOGGLE_MIN_WIDTH;
  const columns = watchingColumn ? COLUMNS_WIDE : COLUMNS_NARROW;
  const [height] = useState(rowHeight);

  const [trigger, setTrigger] = useState<PendingTrigger | null>(null);
  const [moreMenu, setMoreMenu] = useState<MoreMenu | null>(null);
  const [infoGameId, setInfoGameId] = useState<number | null>(null);

  const startJoin = useCallback((gameId: number, asSpectator: boolean, asJudge: boolean, button?: HTMLElement) => {
    const game = roomGames[gameId];
    if (!game) {
      return;
    }
    const anchor = button ?? document.querySelector<HTMLElement>(`[data-join-game="${gameId}"]`);
    setTrigger(anchor ? { gameId, action: asSpectator ? 'spectate' : 'join', button: anchor } : null);
    beginJoin(roomId, game.info, asSpectator, asJudge);
  }, [roomGames, beginJoin, roomId]);

  const activateGame = useCallback((gameId: number) => startJoin(gameId, false, false), [startJoin]);
  const { sortBy, games: gameList, selectedGameId, setSort, handleSelect, handleActivate } =
    useOpenGames({ roomId, onActivateGame: activateGame });
  const sort = currentSortOption(sortBy);
  const onSort = useCallback((id: SortOptionId) => {
    const option = SORT_OPTIONS.find((candidate) => candidate.id === id);
    if (option) {
      setSort(option.field, option.order);
    }
  }, [setSort]);

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

  const joinStates = useMemo(() => {
    const states = new Map<number, RowJoinState>();
    for (const game of gameList) {
      states.set(game.info.gameId, rowJoinState(game.info, {
        override: overrideRestrictions,
        pending: joinPending,
        alreadyJoined: activeGameIds.includes(game.info.gameId),
      }));
    }
    return states;
  }, [gameList, overrideRestrictions, joinPending, activeGameIds]);

  const onAction = useCallback((gameId: number, action: RowAction, button: HTMLElement) => {
    handleSelect(gameId);
    startJoin(gameId, action === 'spectate', false, button);
  }, [handleSelect, startJoin]);

  const onMore = useCallback((gameId: number, button: HTMLElement) => {
    handleSelect(gameId);
    setMoreMenu({ gameId, button, anchor: { rect: button.getBoundingClientRect(), placement: 'below', align: 'end' } });
  }, [handleSelect]);

  const renderGameRow = useCallback((game: Game, index: number, style: CSSProperties) => (
    <GameRow
      key={game.info.gameId}
      game={game}
      index={index}
      style={style}
      columns={columns}
      selected={game.info.gameId === selectedGameId}
      rowProps={getRowProps(String(game.info.gameId))}
      state={joinStates.get(game.info.gameId)!}
      nowSeconds={nowSeconds}
      gametypeMap={room.gametypeMap}
      watchingColumn={watchingColumn}
      onSelect={handleSelect}
      onActivate={handleActivate}
      onAction={onAction}
      onMore={onMore}
    />
  ), [
    columns, selectedGameId, getRowProps, joinStates, nowSeconds, room.gametypeMap, watchingColumn,
    handleSelect, handleActivate, onAction, onMore,
  ]);

  const menuGame = moreMenu ? roomGames[moreMenu.gameId] : undefined;
  const menuState = menuGame ? joinStates.get(menuGame.info.gameId) : undefined;
  const infoGame = infoGameId != null ? roomGames[infoGameId] ?? null : null;
  const passwordAnchor = passwordGame && trigger?.gameId === passwordGame.gameId ? trigger.button : section;
  const sortLabel = t(SORT_KEYS[sort ?? 'custom']);
  const descending = sortBy.order.toUpperCase() === 'DESC';

  return (
    <section
      ref={measureRef}
      aria-label={t('GamesList.heading', { room: room.info.name })}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-ui-lg border border-border-subtle bg-bg-surface shadow-panel"
    >
      {header}
      <div className={header ? 'px-pad pb-3' : 'px-pad pb-3 pt-3'}>
        <QuickFilterBar
          roomFilters={roomFilters}
          gametypeMap={room.gametypeMap}
          passwordInBar={passwordInBar}
          sort={sort}
          onSort={onSort}
        />
      </div>

      <div
        role="grid"
        aria-label={t('GamesList.heading', { room: room.info.name })}
        aria-rowcount={gameList.length + 1}
        className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border-subtle"
      >
        <div role="rowgroup" className="shrink-0">
          <div
            role="row"
            aria-rowindex={1}
            className={[
              'grid items-center gap-gap border-b border-border-subtle bg-bg-elevated/40 px-pad py-1.5',
              'text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted [scrollbar-gutter:stable]',
            ].join(' ')}
            style={{ gridTemplateColumns: columns }}
          >
            <span
              role="columnheader"
              aria-sort={sort ? (descending ? 'descending' : 'ascending') : undefined}
              className="inline-flex items-center gap-1"
            >
              {t('GamesList.column.game', { sort: sortLabel })}
              {sort && (descending ? <ArrowDown size={11} aria-hidden /> : <ArrowUp size={11} aria-hidden />)}
            </span>
            <span role="columnheader">{t('GamesList.column.seats')}</span>
            {watchingColumn && <span role="columnheader">{t('GamesList.column.watching')}</span>}
            <span role="columnheader" className="pr-9 text-right">{t('GamesList.column.actions')}</span>
          </div>
        </div>
        {gameList.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center gap-2 px-4 py-8 text-center text-sm text-text-muted">
            {roomFilters.isActive && roomFilters.counts.total > 0 ? (
              <>
                <span>{t('GamesList.emptyFiltered')}</span>
                <button
                  type="button"
                  onClick={roomFilters.clear}
                  className={[
                    'rounded-ui-sm px-1 font-medium text-accent hover:underline',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                  ].join(' ')}
                >
                  {t('QuickFilterBar.clearAll')}
                </button>
              </>
            ) : (
              <span>{t('GamesList.empty')}</span>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <VirtualRows
              items={gameList}
              rowHeight={height}
              role="rowgroup"
              className="[scrollbar-gutter:stable]"
              renderRow={renderGameRow}
              listRef={listRef}
              onRowsRendered={onRowsRendered}
            />
          </div>
        )}
      </div>

      {moreMenu && menuGame && menuState && (
        <Menu
          anchor={moreMenu.anchor}
          label={t('GameRow.more', { game: gameName(t, menuGame) })}
          triggerRef={{ current: moreMenu.button }}
          onClose={() => setMoreMenu(null)}
        >
          <MenuItem icon={<Info size={14} />} onSelect={() => setInfoGameId(menuGame.info.gameId)}>
            {t('GamesList.action.info')}
          </MenuItem>
          <MenuItem
            icon={<Link size={14} />}
            disabled={!gameLink.available}
            disabledReason={gameLink.unavailableReason ?? undefined}
            onSelect={() => gameLink.copy(menuGame.info)}
          >
            {t('GamesList.action.copyLink')}
          </MenuItem>
          {isJudgeUser && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<Gavel size={14} />}
                disabled={!menuState.canJoin}
                onSelect={() => startJoin(menuGame.info.gameId, false, true)}
              >
                {t('GamesList.action.judge')}
              </MenuItem>
              <MenuItem
                icon={<Gavel size={14} />}
                disabled={!menuState.canSpectate}
                onSelect={() => startJoin(menuGame.info.gameId, true, true)}
              >
                {t('GamesList.action.judgeSpectate')}
              </MenuItem>
            </>
          )}
        </Menu>
      )}

      <RoomGameInfoDialog game={infoGame} gametypeMap={room.gametypeMap} nowSeconds={nowSeconds} onClose={() => setInfoGameId(null)} />
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
      {passwordRequired && passwordGame && (
        <PasswordPopover
          key={passwordGame.gameId}
          anchor={passwordAnchor}
          gameName={passwordGame.description || t('GameRow.untitled', { id: passwordGame.gameId })}
          spectating={trigger?.gameId === passwordGame.gameId && trigger.action === 'spectate'}
          onSubmit={submitPassword}
          onCancel={cancelPassword}
        />
      )}
      <AlertDialog
        isOpen={joinError !== null}
        title={t('GamesList.error.title')}
        message={joinErrorMessage}
        onDismiss={clearJoinError}
      />
    </section>
  );
}
