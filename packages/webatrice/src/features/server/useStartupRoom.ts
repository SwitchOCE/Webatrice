import { useEffect, useRef } from 'react';
import { generatePath, useLocation, useNavigate } from 'react-router-dom';

import { rooms, server, type JoinRoomFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { RouteEnum, type ServerRouteState } from '@app/types';

/** How long to resolve the startup room before the lobby stops looking for it. */
export const STARTUP_ROOM_TIMEOUT_MS = 20_000;

/**
 * Opens the "Server Room" startup tab's room by name once the lobby has the room list, desktop's
 * IntentOpenServerRoomByName. The name must match exactly. A room the server auto-joins is not
 * joined again (desktop: that would be answered with RespContextError), only waited for. The
 * request is dropped, leaving the user in the lobby, when the room is not on the server, the join
 * is refused, or the room remains unresolved after 20 seconds. A pending join (including an
 * auto-join) waits for its response or a disconnect, as desktop's `joinPending` does.
 */
export function useStartupRoom(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const webClient = useWebClient();
  const roomName = (location.state as ServerRouteState | null)?.startupRoom;
  const roomsById = useAppSelector(rooms.Selectors.getRooms);
  const joinedRoomIds = useAppSelector(rooms.Selectors.getJoinedRoomIds);
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const requestedRoomId = useRef<number | null>(null);

  useEffect(() => {
    if (!roomName) {
      requestedRoomId.current = null;
      return;
    }
    if (!isConnected) {
      requestedRoomId.current = null;
      navigate(location.pathname, { replace: true, state: null });
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
    if (requestedRoomId.current === null) {
      requestedRoomId.current = roomId;
      if (!autoJoin) {
        webClient.request.session.joinRoom(roomId);
      }
    }
  }, [roomName, roomsById, joinedRoomIds, isConnected, navigate, location.pathname, webClient]);

  useEffect(() => {
    if (!roomName) {
      return;
    }
    const giveUp = window.setTimeout(() => {
      if (requestedRoomId.current === null) {
        navigate(location.pathname, { replace: true, state: null });
      }
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
