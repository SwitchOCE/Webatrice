import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useNavigate } from 'react-router-dom';
import { LogIn, ArrowRight } from 'lucide-react';

import { useWebClient } from '@cockatrice/datatrice/react';
import { rooms as roomsSlice, type JoinRoomError, type Room } from '@cockatrice/datatrice';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { AlertDialog } from '@app/dialogs';
import { useCommandFailureMessage } from '@app/hooks';
import { useAppDispatch, useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';
import { getRoomPermissionDisplay } from '@app/utils';

const HEADER_CELL_CLASS =
  'text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted '
  + 'border-b border-border-subtle';

// Desktop TabServer::joinRoomFinished messages, keyed by response code. A join the
// server never answered gets the transport reason instead (useCommandFailureMessage).
const JOIN_ERROR_KEYS: Partial<Record<Response_ResponseCode, string>> = {
  [Response_ResponseCode.RespNameNotFound]: 'RoomsList.joinError.notFound',
  [Response_ResponseCode.RespContextError]: 'RoomsList.joinError.contextError',
  [Response_ResponseCode.RespUserLevelTooLow]: 'RoomsList.joinError.userLevelTooLow',
};

function joinErrorMessage(error: JoinRoomError, t: (key: string, params?: Record<string, unknown>) => string): string {
  const key = JOIN_ERROR_KEYS[error.responseCode as Response_ResponseCode];
  return key ? t(key) : t('RoomsList.joinError.unknown', { code: error.responseCode });
}

interface RoomsListProps {
  rooms: Record<number, Room>;
  joinedRooms: Room[];
}

/** Tailwind rewrite of the pre-redo MUI `<Table>` roomsList. Same data
 *  hookups + join flow as before — clicking a joined room navigates
 *  straight to it; clicking a non-joined room fires the join command
 *  and the JOIN_ROOM reduxEffect in Server.tsx handles the redirect. */
export default function RoomsList({ rooms, joinedRooms }: RoomsListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const webClient = useWebClient();
  const joinError = useAppSelector(roomsSlice.Selectors.getJoinRoomError);
  const describeFailure = useCommandFailureMessage();

  const joinedRoomIds = useMemo(
    () => new Set(joinedRooms.map((room) => room.info.roomId)),
    [joinedRooms],
  );

  const onClick = (roomId: number) => {
    if (joinedRoomIds.has(roomId)) {
      navigate(generatePath(RouteEnum.ROOM, { roomId: String(roomId) }));
    } else {
      webClient.request.session.joinRoom(roomId);
    }
  };

  const roomList = Object.values(rooms);

  return (
    <section className="flex h-full flex-col bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div>
          <h2 className="font-modern text-lg font-semibold text-text-primary">Rooms</h2>
          <p className="text-xs text-text-muted mt-0.5 tabular-nums">
            {roomList.length} available
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
          <thead className="sticky top-0 z-10 bg-bg-elevated">
            <tr>
              <th className={HEADER_CELL_CLASS}>
                Name
              </th>
              <th className={HEADER_CELL_CLASS}>
                Description
              </th>
              <th className={`${HEADER_CELL_CLASS} w-32`}>
                Permissions
              </th>
              <th className={`${HEADER_CELL_CLASS} w-20 tabular-nums`}>
                Players
              </th>
              <th className={`${HEADER_CELL_CLASS} w-20 tabular-nums`}>
                Games
              </th>
              <th className="border-b border-border-subtle w-28" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {roomList.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                  No rooms available.
                </td>
              </tr>
            )}
            {roomList.map((room) => {
              const { description, gameCount, name, playerCount, roomId } = room.info;
              const joined = joinedRoomIds.has(roomId);
              return (
                <tr
                  key={roomId}
                  className="hover:bg-bg-elevated transition-colors"
                >
                  <td className="px-3 py-2 border-b border-border-subtle/50 text-text-primary font-medium whitespace-nowrap">
                    {name}
                  </td>
                  <td className="px-3 py-2 border-b border-border-subtle/50 text-text-secondary truncate max-w-0">
                    <div className="truncate" title={description}>{description}</div>
                  </td>
                  <td className="px-3 py-2 border-b border-border-subtle/50 text-text-muted lowercase whitespace-nowrap">
                    {getRoomPermissionDisplay(room.info)}
                  </td>
                  <td className="px-3 py-2 border-b border-border-subtle/50 text-text-primary tabular-nums whitespace-nowrap">
                    {playerCount}
                  </td>
                  <td className="px-3 py-2 border-b border-border-subtle/50 text-text-primary tabular-nums whitespace-nowrap">
                    {gameCount}
                  </td>
                  <td className="px-3 py-2 border-b border-border-subtle/50 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onClick(roomId)}
                      className={[
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors',
                        joined
                          ? 'bg-bg-elevated text-text-secondary hover:text-text-primary border border-border-subtle'
                          : 'bg-accent text-white hover:bg-accent-hover shadow-glow',
                      ].join(' ')}
                    >
                      {joined ? (
                        <>
                          <ArrowRight size={14} /> Open
                        </>
                      ) : (
                        <>
                          <LogIn size={14} /> Join
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* A rejected join keeps the user in the lobby (desktop parity) and can be retried. */}
      <AlertDialog
        isOpen={joinError !== null}
        title={t('RoomsList.joinError.title')}
        message={joinError ? describeFailure(joinError.failure, joinErrorMessage(joinError, t)) : ''}
        onDismiss={() => dispatch(roomsSlice.Actions.clearJoinRoomError())}
      />
    </section>
  );
}
