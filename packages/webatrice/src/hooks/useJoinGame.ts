import { useCallback, useEffect, useState } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { games, rooms, type JoinGameError } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { Event_GameJoined, ServerInfo_Game } from '@cockatrice/sockatrice/generated';
import { useAppDispatch, useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import { useReduxEffect } from './useReduxEffect';

// The useJoinGame instance whose join the stored `rooms.joinGameError` answers.
// Several lists can be mounted at once (a user menu's games dialog over a room's
// game list) and all read the one store field, so only this owner shows the
// error; null (no join sent from a list yet) lets every list show it.
let joinErrorOwner: symbol | null = null;

interface PendingJoin {
  roomId: number;
  gameId: number;
  asSpectator: boolean;
  asJudge: boolean;
}

export interface JoinGameFlow {
  /** Join (or spectate) a game the way desktop GameSelector::joinGame does. */
  beginJoin: (roomId: number, game: ServerInfo_Game, asSpectator: boolean, asJudge: boolean) => void;
  /** True while a password prompt for the requested join is open. */
  passwordRequired: boolean;
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
 * the list that sent the last join reports it (see `joinErrorOwner`).
 */
export function useJoinGame(): JoinGameFlow {
  const webClient = useWebClient();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeGameIds = useAppSelector(games.Selectors.getActiveGameIds);
  const joinPending = useAppSelector(rooms.Selectors.getJoinGamePending);
  const storedJoinError = useAppSelector(rooms.Selectors.getJoinGameError);
  const [pendingPasswordJoin, setPendingPasswordJoin] = useState<PendingJoin | null>(null);
  const [owner] = useState(() => Symbol('useJoinGame'));
  const joinError = joinErrorOwner === null || joinErrorOwner === owner ? storedJoinError : null;

  // A list that closes while it owns the error takes it along, so it never
  // surfaces later in another list.
  useEffect(() => () => {
    if (joinErrorOwner === owner) {
      joinErrorOwner = null;
      dispatch(rooms.Actions.clearJoinGameError());
    }
  }, [dispatch, owner]);

  const sendJoin = useCallback(
    ({ roomId, gameId, asSpectator, asJudge }: PendingJoin, password: string) => {
      if (activeGameIds.includes(gameId)) {
        navigate(generatePath(RouteEnum.GAME, { gameId: gameId.toString() }));
        return;
      }
      joinErrorOwner = owner;
      webClient.request.rooms.joinGame(roomId, {
        gameId,
        password,
        spectator: asSpectator,
        overrideRestrictions: false,
        joinAsJudge: asJudge,
      });
    },
    [activeGameIds, navigate, owner, webClient],
  );

  const beginJoin = useCallback(
    (roomId: number, game: ServerInfo_Game, asSpectator: boolean, asJudge: boolean) => {
      const effectiveSpectator = asSpectator || game.playerCount >= game.maxPlayers;
      const join = { roomId, gameId: game.gameId, asSpectator: effectiveSpectator, asJudge };
      const needsPassword = game.withPassword && !(effectiveSpectator && !game.spectatorsNeedPassword);
      if (needsPassword) {
        setPendingPasswordJoin(join);
        return;
      }
      sendJoin(join, '');
    },
    [sendJoin],
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
  const clearJoinError = useCallback(() => dispatch(rooms.Actions.clearJoinGameError()), [dispatch]);

  return {
    beginJoin,
    passwordRequired: pendingPasswordJoin !== null,
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
