import { useEffect, useRef } from 'react';
import { generatePath, useLocation, useNavigate } from 'react-router-dom';

import { rooms, type JoinRoomFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { RouteEnum, type ServerRouteState } from '@app/types';

/** How long the startup room may take to open before the lobby stops waiting for it. */
export const STARTUP_ROOM_TIMEOUT_MS = 20_000;

/**
 * Opens the "Server Room" startup tab's room by name once the lobby has the room list, desktop's
 * IntentOpenServerRoomByName. The name must match exactly. A room the server auto-joins is not
 * joined again (desktop: that would be answered with RespContextError), only waited for. The
 * request is dropped, leaving the user in the lobby, when the room is not on the server, the join
 * is refused, or the room has not opened after 20 seconds (desktop's give-up, `singleShot(20000)`).
 */
export function useStartupRoom(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const webClient = useWebClient();
  const roomName = (location.state as ServerRouteState | null)?.startupRoom;
  const roomsById = useAppSelector(rooms.Selectors.getRooms);
  const joinedRoomIds = useAppSelector(rooms.Selectors.getJoinedRoomIds);
  const requestedRoomId = useRef<number | null>(null);

  useEffect(() => {
    if (!roomName) {
      return;
    }
    const roomList = Object.values(roomsById);
    if (!roomList.length) {
      return; // the room list has not arrived yet
    }
    const room = roomList.find(({ info }) => info.name === roomName);
    if (!room) {
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    const { roomId, autoJoin } = room.info;
    if (joinedRoomIds[roomId]) {
      navigate(generatePath(RouteEnum.ROOM, { roomId: String(roomId) }), { replace: true });
      return;
    }
    if (!autoJoin && requestedRoomId.current === null) {
      requestedRoomId.current = roomId;
      webClient.request.session.joinRoom(roomId);
    }
  }, [roomName, roomsById, joinedRoomIds, navigate, location.pathname, webClient]);

  useEffect(() => {
    if (!roomName) {
      return;
    }
    const giveUp = window.setTimeout(() => {
      requestedRoomId.current = null;
      navigate(location.pathname, { replace: true, state: null });
    }, STARTUP_ROOM_TIMEOUT_MS);
    return () => window.clearTimeout(giveUp);
  }, [roomName, navigate, location.pathname]);

  useReduxEffect<JoinRoomFailedPayload>((action) => {
    if (action.payload.roomId === requestedRoomId.current) {
      requestedRoomId.current = null;
      navigate(location.pathname, { replace: true, state: null });
    }
  }, rooms.Types.JOIN_ROOM_FAILED, [location.pathname]);
}
