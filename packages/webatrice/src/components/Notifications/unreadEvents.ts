import { games, rooms, server, type GameEntry, type Message } from '@cockatrice/datatrice';
import { Event_RoomSay_RoomMessageType, type Event_UserMessage } from '@cockatrice/sockatrice/generated';
import { matchPath } from 'react-router-dom';

import type { RootState } from '@app/store';
import { RouteEnum } from '@app/types';

import type { UnreadScope } from './notificationStore';

export interface ObservedAction {
  type: string | null;
  payload: unknown;
}

export interface CurrentView {
  roomId?: number;
  gameId?: number;
  chatPeer?: string;
}

export interface UnreadChange {
  op: 'bump' | 'clear';
  scope: UnreadScope;
  key: number | string;
}

export interface VisibilityChecks {
  roomMessage: (roomId: number, state: RootState) => boolean;
  privateMessage: (peer: string, state: RootState) => boolean;
}

export function currentView(pathname: string): CurrentView {
  const room = matchPath({ path: RouteEnum.ROOM, end: true }, pathname)?.params.roomId;
  const game = matchPath({ path: RouteEnum.GAME, end: true }, pathname)?.params.gameId;
  const peer = matchPath({ path: RouteEnum.PLAYER, end: true }, pathname)?.params.name;
  return {
    roomId: room != null ? Number(room) : undefined,
    gameId: game != null ? Number(game) : undefined,
    chatPeer: peer,
  };
}

const G = games.Types;
const GAME_GONE: ReadonlySet<string> = new Set([G.GAME_LEFT, G.GAME_CLOSED, G.KICKED]);

function liveGame(state: RootState, gameId: number): GameEntry | undefined {
  const game = state.games.games[gameId];
  return game && !game.replay ? game : undefined;
}

function gameChange(action: ObservedAction, before: RootState, after: RootState, view: CurrentView): UnreadChange | null {
  const { gameId, playerId } = action.payload as { gameId: number; playerId?: number };
  if (GAME_GONE.has(action.type ?? '')) {
    return { op: 'clear', scope: 'games', key: gameId };
  }
  if (gameId === view.gameId) {
    return null;
  }
  const bump: UnreadChange = { op: 'bump', scope: 'games', key: gameId };
  switch (action.type) {
    case G.GAME_SAY: {
      const game = liveGame(after, gameId);
      return game && playerId !== game.localPlayerId ? bump : null;
    }
    case G.PLAYER_JOINED: {
      const joined = (action.payload as { playerProperties: { playerId: number } }).playerProperties.playerId;
      const game = liveGame(after, gameId);
      return game && joined !== game.localPlayerId && !before.games.games[gameId]?.players[joined] ? bump : null;
    }
    case G.PLAYER_LEFT: {
      const game = liveGame(before, gameId);
      return game && playerId !== game.localPlayerId && game.players[playerId ?? -1] ? bump : null;
    }
    default:
      return null;
  }
}

function roomChange(action: ObservedAction, after: RootState, view: CurrentView, checks: VisibilityChecks): UnreadChange | null {
  if (action.type === rooms.Types.LEAVE_ROOM) {
    return { op: 'clear', scope: 'rooms', key: (action.payload as { roomId: number }).roomId };
  }
  const { roomId, message } = action.payload as { roomId: number; message: Message };
  const selfName = after.server.user?.name;
  if (
    roomId === view.roomId
    || message.messageType === Event_RoomSay_RoomMessageType.ChatHistory
    || !message.name
    || message.name === selfName
    || !checks.roomMessage(roomId, after)
  ) {
    return null;
  }
  return { op: 'bump', scope: 'rooms', key: roomId };
}

function chatChange(action: ObservedAction, after: RootState, view: CurrentView, checks: VisibilityChecks): UnreadChange | null {
  const { messageData } = action.payload as { messageData: Event_UserMessage };
  const selfName = after.server.user?.name;
  const peer = messageData.senderName;
  if (!selfName || peer === selfName || peer === view.chatPeer || !checks.privateMessage(peer, after)) {
    return null;
  }
  return { op: 'bump', scope: 'chats', key: peer };
}

const GAME_PREFIX = `${G.GAME_JOINED.split('/')[0]}/`;

export function unreadChange(
  action: ObservedAction,
  before: RootState,
  after: RootState,
  view: CurrentView,
  checks: VisibilityChecks,
): UnreadChange | null {
  if (action.type === rooms.Types.ADD_MESSAGE || action.type === rooms.Types.LEAVE_ROOM) {
    return roomChange(action, after, view, checks);
  }
  if (action.type === server.Types.USER_MESSAGE) {
    return chatChange(action, after, view, checks);
  }
  if (action.type?.startsWith(GAME_PREFIX)) {
    return gameChange(action, before, after, view);
  }
  return null;
}
