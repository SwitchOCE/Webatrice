import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { rooms, server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { Response_ResponseCode, type ServerInfo_Game } from '@cockatrice/sockatrice/generated';
import { AlertDialog, DialogShell, PromptDialog } from '@app/dialogs';
import { useCommandFailureMessage, useJoinGame, useNavigateOnGameJoined } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { formatRestrictions, formatSpectators } from '@app/utils';

const CELL_CLASS = 'px-3 py-2 border-b border-border-subtle/50 whitespace-nowrap';
const HEADER_CELL_CLASS =
  'text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted border-b border-border-subtle';
const BUTTON_CLASS =
  'px-3 py-1.5 rounded-md text-sm font-medium bg-bg-elevated text-text-secondary hover:text-text-primary '
  + 'border border-border-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

const COLUMNS = ['room', 'description', 'creator', 'type', 'restrictions', 'players', 'spectators'] as const;

// Desktop UserContextMenu::gamesOfUserReceived messages, keyed by response code;
// any other rejection gets its generic "Could not get %1's games." message, and a
// request the server never answered gets the transport reason.
const FAILURE_KEYS: Partial<Record<Response_ResponseCode, string>> = {
  [Response_ResponseCode.RespNameNotFound]: 'UserGamesDialog.error.userNotFound',
  [Response_ResponseCode.RespInIgnoreList]: 'UserGamesDialog.error.ignored',
};

interface UserGamesDialogProps {
  userName: string;
  onClose: () => void;
}

/**
 * Desktop "Show this user's games" (UserContextMenu::execShowGames): asks the
 * server for the games a user is in and lists them in a game selector without
 * filters or a create button, offering GameSelector's join and spectate
 * actions through the shared join flow (password prompt, server errors).
 * As on desktop, joining needs the game's room to be joined first.
 */
export default function UserGamesDialog({ userName, onClose }: UserGamesDialogProps) {
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const webClient = useWebClient();
  const status = useAppSelector((state) => server.Selectors.getGamesOfUserStatus(state, userName));
  const gameList = useAppSelector((state) => server.Selectors.getGamesOfUser(state, userName));
  const allRooms = useAppSelector(rooms.Selectors.getRooms);
  const joinedRoomIds = useAppSelector(rooms.Selectors.getJoinedRoomIds);
  const isJudgeUser = useAppSelector(server.Selectors.getIsUserJudge);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [roomNotJoined, setRoomNotJoined] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const { beginJoin, passwordRequired, submitPassword, cancelPassword, joinPending, joinError, clearJoinError } =
    useJoinGame();

  useEffect(() => {
    webClient.request.session.getGamesOfUser(userName);
  }, [userName, webClient]);

  // A join from this list was confirmed and the app is routing to the game: the selector's job is done.
  const closeOnJoin = useCallback(
    (gameId: number) => {
      if (gameList.some((game) => game.info.gameId === gameId)) {
        onClose();
      }
    },
    [gameList, onClose],
  );
  useNavigateOnGameJoined(closeOnJoin);

  const selected = gameList.find((game) => game.info.gameId === selectedGameId)?.info;

  const join = useCallback(
    (game: ServerInfo_Game | undefined, asSpectator: boolean, asJudge: boolean) => {
      if (!game) {
        return;
      }
      if (!joinedRoomIds[game.roomId]) {
        setRoomNotJoined(true);
        return;
      }
      beginJoin(game.roomId, game, asSpectator, asJudge);
    },
    [beginJoin, joinedRoomIds],
  );

  // Grid keyboard pattern with a roving tabindex: the selected row (else the first) is the
  // one Tab stop; arrows, Home and End move the selection with focus, Space selects, and
  // Enter joins like a double-click.
  const focusedGameId = selected ? selected.gameId : gameList[0]?.info.gameId;
  const selectAndFocus = (gameId: number) => {
    setSelectedGameId(gameId);
    rowRefs.current.get(gameId)?.focus();
  };
  const onRowKeyDown = (event: KeyboardEvent, index: number) => {
    const { info } = gameList[index];
    const target = {
      ArrowDown: Math.min(index + 1, gameList.length - 1),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: gameList.length - 1,
    }[event.key];
    if (target !== undefined) {
      selectAndFocus(gameList[target].info.gameId);
    } else if (event.key === ' ') {
      setSelectedGameId(info.gameId);
    } else if (event.key === 'Enter') {
      setSelectedGameId(info.gameId);
      join(info, false, false);
    } else {
      return;
    }
    event.preventDefault();
  };

  // Desktop GameSelector::enableButtonsForIndex, plus no second join while one is in flight.
  const canJoin = Boolean(selected && selected.playerCount < selected.maxPlayers) && !joinPending;
  const canSpectate = Boolean(selected?.spectatorsAllowed) && !joinPending;

  let body;
  if (status?.state === 'failed') {
    const key = FAILURE_KEYS[status.responseCode as Response_ResponseCode] ?? 'UserGamesDialog.error.unknown';
    const message = describeFailure(status.failure, t(key, { name: userName }));
    body = <p role="alert" className="text-sm text-text-secondary">{message}</p>;
  } else if (status?.state !== 'loaded') {
    body = <p className="text-sm text-text-muted">{t('UserGamesDialog.loading')}</p>;
  } else if (gameList.length === 0) {
    body = <p className="text-sm text-text-muted">{t('UserGamesDialog.empty', { name: userName })}</p>;
  } else {
    body = (
      <table
        role="grid"
        aria-label={t('UserGamesDialog.title', { name: userName })}
        className="w-full text-sm text-text-secondary border-separate"
        style={{ borderSpacing: 0 }}
      >
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} role="columnheader" className={HEADER_CELL_CLASS}>{t(`UserGamesDialog.column.${column}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gameList.map(({ info, gameType }, index) => (
            <tr
              key={info.gameId}
              ref={(row) => {
                if (row) {
                  rowRefs.current.set(info.gameId, row);
                } else {
                  rowRefs.current.delete(info.gameId);
                }
              }}
              role="row"
              tabIndex={info.gameId === focusedGameId ? 0 : -1}
              aria-selected={info.gameId === selectedGameId}
              onClick={() => setSelectedGameId(info.gameId)}
              onDoubleClick={() => join(info, false, false)}
              onKeyDown={(event) => onRowKeyDown(event, index)}
              className={[
                'cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 '
                  + 'focus-visible:-outline-offset-2 focus-visible:outline-accent',
                info.gameId === selectedGameId ? 'bg-accent/20' : 'hover:bg-bg-elevated',
              ].join(' ')}
            >
              <td role="gridcell" className={CELL_CLASS}>{allRooms[info.roomId]?.info.name ?? `#${info.roomId}`}</td>
              <td role="gridcell" className={`${CELL_CLASS} text-text-primary`}>{info.description}</td>
              <td role="gridcell" className={CELL_CLASS}>{info.creatorInfo?.name ?? ''}</td>
              <td role="gridcell" className={CELL_CLASS}>{gameType}</td>
              <td role="gridcell" className={CELL_CLASS}>{formatRestrictions(info)}</td>
              <td role="gridcell" className={`${CELL_CLASS} tabular-nums`}>{info.playerCount}/{info.maxPlayers}</td>
              <td role="gridcell" className={CELL_CLASS}>{formatSpectators(info)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <DialogShell
        isOpen
        title={t('UserGamesDialog.title', { name: userName })}
        handleClose={onClose}
        maxWidth="max-w-4xl"
      >
        <div className="min-h-24 overflow-x-auto">{body}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={BUTTON_CLASS} disabled={!canJoin} onClick={() => join(selected, false, false)}>
            {t('UserGamesDialog.action.join')}
          </button>
          {isJudgeUser && (
            <button type="button" className={BUTTON_CLASS} disabled={!canJoin} onClick={() => join(selected, false, true)}>
              {t('UserGamesDialog.action.joinAsJudge')}
            </button>
          )}
          <button type="button" className={BUTTON_CLASS} disabled={!canSpectate} onClick={() => join(selected, true, false)}>
            {t('UserGamesDialog.action.spectate')}
          </button>
          {isJudgeUser && (
            <button type="button" className={BUTTON_CLASS} disabled={!canSpectate} onClick={() => join(selected, true, true)}>
              {t('UserGamesDialog.action.spectateAsJudge')}
            </button>
          )}
        </div>
      </DialogShell>
      <PromptDialog
        isOpen={passwordRequired}
        title={t('UserGamesDialog.password.title')}
        label={t('UserGamesDialog.password.label')}
        submitLabel={t('UserGamesDialog.password.submit')}
        onSubmit={submitPassword}
        onCancel={cancelPassword}
      />
      <AlertDialog
        isOpen={joinError !== null || roomNotJoined}
        title={t('UserGamesDialog.error.title')}
        message={roomNotJoined ? t('UserGamesDialog.error.joinRoomFirst') : (joinError?.message ?? '')}
        onDismiss={() => (roomNotJoined ? setRoomNotJoined(false) : clearJoinError())}
      />
    </>
  );
}
