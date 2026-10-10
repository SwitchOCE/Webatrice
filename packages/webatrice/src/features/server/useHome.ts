import { useCallback, useMemo } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { rooms, server, type Room } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_Room } from '@cockatrice/sockatrice/generated';
import { usePreference, useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import {
  buddyHostedGames,
  countOpenSeatGames,
  onlineBuddies,
  pickUsualRoom,
  sortRooms,
  totalGames,
  type BuddyGame,
  type OnlineBuddy,
} from './homeModel';

export interface HomeData {
  userName: string;
  serverName: string | null;
  message: string | null;
  onlineCount: number;
  gamesRunning: number;
  roomList: Room[];
  joinedRoomIds: Readonly<Record<number, boolean>>;
  joinedRooms: Room[];
  usualRoom: Room | undefined;
  usualRoomJoined: boolean;
  usualRoomOpenSeats: number;
  buddyGames: BuddyGame[];
  buddiesOnline: OnlineBuddy[];
  buddyCount: number;
  openRoom: (roomId: number) => void;
  play: () => void;
}

export function useOpenRoom(): (roomId: number) => void {
  const navigate = useNavigate();
  const webClient = useWebClient();
  const joinedRoomIds = useAppSelector(rooms.Selectors.getJoinedRoomIds);
  return useCallback((roomId: number) => {
    if (joinedRoomIds[roomId]) {
      navigate(generatePath(RouteEnum.ROOM, { roomId: String(roomId) }));
    } else {
      webClient.request.session.joinRoom(roomId);
    }
  }, [joinedRoomIds, navigate, webClient]);
}

export function useNavigateOnRoomJoined(): void {
  const navigate = useNavigate();
  useReduxEffect<{ roomInfo: ServerInfo_Room; userInitiated?: boolean }>((action) => {
    if (action.payload.userInitiated === false) {
      return;
    }
    navigate(generatePath(RouteEnum.ROOM, { roomId: action.payload.roomInfo.roomId.toString() }));
  }, rooms.Types.JOIN_ROOM, []);
}

export function useHome(): HomeData {
  const roomsById = useAppSelector(rooms.Selectors.getRooms);
  const joinedRoomIds = useAppSelector(rooms.Selectors.getJoinedRoomIds);
  const joinedRooms = useAppSelector(rooms.Selectors.getJoinedRooms);
  const buddyList = useAppSelector(server.Selectors.getBuddyList);
  const users = useAppSelector(server.Selectors.getUsers);
  const userName = useAppSelector(server.Selectors.getUser)?.name ?? '';
  const serverName = useAppSelector(server.Selectors.getName);
  const message = useAppSelector(server.Selectors.getMessage);
  const startupRoom = usePreference('startupRoom');
  const openRoom = useOpenRoom();
  useNavigateOnRoomJoined();

  const roomList = useMemo(() => sortRooms(roomsById), [roomsById]);
  const usualRoom = useMemo(
    () => pickUsualRoom(roomList, joinedRoomIds, startupRoom ?? ''),
    [roomList, joinedRoomIds, startupRoom],
  );
  const buddyNames = useMemo(() => new Set(Object.keys(buddyList)), [buddyList]);
  const buddyGames = useMemo(() => buddyHostedGames(joinedRooms, buddyNames), [joinedRooms, buddyNames]);
  const buddiesOnline = useMemo(() => onlineBuddies(buddyList, users, buddyGames), [buddyList, users, buddyGames]);
  const usualRoomJoined = Boolean(usualRoom && joinedRoomIds[usualRoom.info.roomId]);
  const usualRoomId = usualRoom?.info.roomId;

  const play = useCallback(() => {
    if (usualRoomId != null) {
      openRoom(usualRoomId);
    }
  }, [openRoom, usualRoomId]);

  return {
    userName,
    serverName,
    message,
    onlineCount: Object.keys(users).length,
    gamesRunning: totalGames(roomList),
    roomList,
    joinedRoomIds,
    joinedRooms,
    usualRoom,
    usualRoomJoined,
    usualRoomOpenSeats: usualRoom && usualRoomJoined ? countOpenSeatGames(usualRoom) : 0,
    buddyGames,
    buddiesOnline,
    buddyCount: buddyNames.size,
    openRoom,
    play,
  };
}
