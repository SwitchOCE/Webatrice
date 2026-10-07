import { useCallback, useState } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { games, rooms, type JoinGameError } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { Event_GameJoined, ServerInfo_Game } from '@cockatrice/sockatrice/generated';
import { useAppDispatch, useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import { useReduxEffect } from './useReduxEffect';
import { useRequestTracker } from './useRequestTracker';

interface PendingJoin {
  roomId: number;
  gameId: number;
  description: string;
  asSpectator: boolean;
  asJudge: boolean;
}

export interface JoinGameFlow {
  /** Join (or spectate) a game the way desktop GameSelector::joinGame does. */
  beginJoin: (roomId: number, game: ServerInfo_Game, asSpectator: boolean, asJudge: boolean) => void;
  /** True while a password prompt for the requested join is open. */
  passwordRequired: boolean;
  passwordGame: Pick<ServerInfo_Game, 'gameId' | 'description'> | null;
  submitPassword: (password: string) => void;
  cancelPassword: () => void;
  joinPending: boolean;
  joinError: JoinGameError | null;
  clearJoinError: () => void;
}

/**
 * The game-join flow shared by every game list: skip the command for a game
 * already open (the server would answer RespContextError) and route to it,
 * join a full game as a spectator, ask for the password when the join needs
 * one, then send Command_JoinGame. Server rejections arrive as
 * `rooms.joinGameError` (desktop GameSelector::checkResponse messages); only
 * the list that owns that request reports it.
 */
export function useJoinGame(onAlreadyOpen?: () => void): JoinGameFlow {
  const webClient = useWebClient();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeGameIds = useAppSelector(games.Selectors.getActiveGameIds);
  const joinPending = useAppSelector(rooms.Selectors.getJoinGamePending);
  const storedJoinError = useAppSelector(rooms.Selectors.getJoinGameError);
  const [pendingPasswordJoin, setPendingPasswordJoin] = useState<PendingJoin | null>(null);
  const request = useRequestTracker();
  const [joinError, setJoinError] = useState<JoinGameError | null>(null);

  // Retain the accepted snapshot: another list or an older request may overwrite
  // the shared store error without changing the outcome owned by this selector.
  useReduxEffect<JoinGameError>((action) => {
    if (request.isCurrent(action.payload.requestId)) {
      setJoinError(action.payload);
      request.cancel();
    }
  }, rooms.Types.SET_JOIN_GAME_ERROR, [request]);

  const sendJoin = useCallback(
    ({ roomId, gameId, asSpectator, asJudge }: PendingJoin, password: string) => {
      if (activeGameIds.includes(gameId)) {
        navigate(generatePath(RouteEnum.GAME, { gameId: gameId.toString() }));
        onAlreadyOpen?.();
        return;
      }
      setJoinError(null);
      const requestId = request.begin();
      webClient.request.rooms.joinGame(roomId, {
        gameId,
        password,
        spectator: asSpectator,
        overrideRestrictions: false,
        joinAsJudge: asJudge,
      }, requestId);
    },
    [activeGameIds, navigate, onAlreadyOpen, request, webClient],
  );

  const beginJoin = useCallback(
    (roomId: number, game: ServerInfo_Game, asSpectator: boolean, asJudge: boolean) => {
      const effectiveSpectator = asSpectator || game.playerCount >= game.maxPlayers;
      const join = { roomId, gameId: game.gameId, description: game.description, asSpectator: effectiveSpectator, asJudge };
      if (activeGameIds.includes(game.gameId)) {
        sendJoin(join, '');
        return;
      }
      const needsPassword = game.withPassword && !(effectiveSpectator && !game.spectatorsNeedPassword);
      if (needsPassword) {
        setPendingPasswordJoin(join);
        return;
      }
      sendJoin(join, '');
    },
    [activeGameIds, sendJoin],
  );

  const submitPassword = useCallback(
    (password: string) => {
      if (pendingPasswordJoin) {
        sendJoin(pendingPasswordJoin, password);
        setPendingPasswordJoin(null);
      }
    },
    [pendingPasswordJoin, sendJoin],
  );

  const cancelPassword = useCallback(() => setPendingPasswordJoin(null), []);
  const clearJoinError = useCallback(() => {
    if (joinError?.requestId !== undefined && storedJoinError?.requestId === joinError.requestId) {
      dispatch(rooms.Actions.clearJoinGameError());
    }
    request.cancel();
    setJoinError(null);
  }, [dispatch, joinError, request, storedJoinError]);

  return {
    beginJoin,
    passwordRequired: pendingPasswordJoin !== null,
    passwordGame: pendingPasswordJoin,
    submitPassword,
    cancelPassword,
    joinPending,
    joinError,
    clearJoinError,
  };
}

// Joins already routed, by the action snapshot they arrived in. Every mounted
// game list listens for Event_GameJoined (a user menu's games dialog can be open
// over a room's game list); the first listener routes and the rest skip, so one
// join never pushes the game route twice.
const routedJoins = new WeakSet<object>();

/** Route to /game/:gameId whenever the server confirms a game join. */
export function useNavigateOnGameJoined(onJoined?: (gameId: number) => void): void {
  const navigate = useNavigate();
  useReduxEffect<{ data: Event_GameJoined }>((action) => {
    const gameId = action.payload.data.gameInfo?.gameId;
    if (gameId == null) {
      return;
    }
    onJoined?.(gameId);
    if (routedJoins.has(action)) {
      return;
    }
    routedJoins.add(action);
    navigate(generatePath(RouteEnum.GAME, { gameId: gameId.toString() }));
  }, games.Types.GAME_JOINED, [navigate, onJoined]);
}
