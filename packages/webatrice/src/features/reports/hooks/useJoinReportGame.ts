import { useCallback, useEffect, useState } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { games, rooms, server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { Event_GameJoined } from '@cockatrice/sockatrice/generated';
import { useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

interface PendingJoin {
  gameId: number;
  roomId: number;
}

/**
 * Desktop TabSupervisor::joinReportGame: spectate the reported game, joining
 * its room first when needed (IntentJoinServerGame). Restrictions are only
 * overridden for judges, matching desktop's default admin-locked
 * canOverrideGameRestrictions(). Join errors surface through the shared
 * rooms.joinGameError like any other join; a successful join opens the game.
 */
export function useJoinReportGame(): (gameId: number, roomId: number) => void {
  const webClient = useWebClient();
  const navigate = useNavigate();
  const joinedRoomIds = useAppSelector(rooms.Selectors.getJoinedRoomIds);
  const activeGameIds = useAppSelector(games.Selectors.getActiveGameIds);
  const isJudge = useAppSelector(server.Selectors.getIsUserJudge);
  const [pending, setPending] = useState<PendingJoin | null>(null);

  const sendJoin = useCallback((gameId: number, roomId: number) => {
    webClient.request.rooms.joinGame(roomId, {
      gameId,
      password: '',
      spectator: true,
      overrideRestrictions: isJudge,
      joinAsJudge: false,
    });
  }, [webClient, isJudge]);

  // The room join answers asynchronously; spectate once the room is ours.
  useEffect(() => {
    if (pending && joinedRoomIds[pending.roomId]) {
      setPending(null);
      sendJoin(pending.gameId, pending.roomId);
    }
  }, [pending, joinedRoomIds, sendJoin]);

  useReduxEffect<{ data: Event_GameJoined }>((action) => {
    const gameId = action.payload.data.gameInfo?.gameId;
    if (gameId != null) {
      navigate(generatePath(RouteEnum.GAME, { gameId: gameId.toString() }));
    }
  }, games.Types.GAME_JOINED, [navigate]);

  return useCallback((gameId: number, roomId: number) => {
    if (activeGameIds.includes(gameId)) {
      navigate(generatePath(RouteEnum.GAME, { gameId: gameId.toString() }));
      return;
    }
    if (joinedRoomIds[roomId]) {
      sendJoin(gameId, roomId);
      return;
    }
    setPending({ gameId, roomId });
    webClient.request.session.joinRoom(roomId);
  }, [activeGameIds, joinedRoomIds, navigate, sendJoin, webClient]);
}
