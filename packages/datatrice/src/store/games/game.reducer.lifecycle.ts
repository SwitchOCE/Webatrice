import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import { Event_GameJoined, ServerInfo_Game, ServerInfo_GameSchema } from '@cockatrice/sockatrice/generated';
import { cloneWith } from '../../common';
import { Enriched } from '../../types';
import { GamesState } from './game.interfaces';
import { pushEventMessage } from './game.reducer.helpers';
import { EVENT_PLAYER_ID_SYSTEM, formatGameClosed, formatReplayStarted } from './messageLog';

const initialState: GamesState = { games: {}, pings: {} };

/**
 * The games state with every server game dropped. Replay games are local
 * playback, not session state, so a disconnect or store reset must not tear
 * down a replay the user is watching (desktop keeps replay tabs open offline).
 */
export function retainReplayGames(state: GamesState): GamesState {
  const games: GamesState['games'] = {};
  const pings: GamesState['pings'] = {};
  for (const [id, game] of Object.entries(state.games)) {
    if (game.replay) {
      games[Number(id)] = game;
      pings[Number(id)] = state.pings[Number(id)] ?? {};
    }
  }
  return { ...initialState, games, pings };
}

// Mirrors desktop's replay game state: no local player, an omniscient spectator
// (Replay ctor + AbstractGame::loadReplay), with the replay-started log line.
function buildReplayGame(gameInfo: ServerInfo_Game, logStart: boolean): Enriched.GameEntry {
  const game: Enriched.GameEntry = {
    info: cloneWith(ServerInfo_GameSchema, gameInfo, { spectatorsOmniscient: true }),
    hostId: -1,
    localPlayerId: -1,
    spectator: true,
    judge: false,
    resuming: false,
    started: false,
    activePlayerId: -1,
    activePhase: -1,
    secondsElapsed: 0,
    reversed: false,
    players: {},
    seatOrder: [],
    messages: [],
    replay: true,
  };
  if (logStart) {
    pushEventMessage(game, EVENT_PLAYER_ID_SYSTEM, formatReplayStarted(gameInfo.gameId));
  }
  return game;
}

export const lifecycleReducers = {
  clearStore: ((state) => retainReplayGames(state)) as CaseReducer<GamesState>,

  gameJoined: ((state, action) => {
    const { data } = action.payload;
    const gameInfo = data.gameInfo;
    if (!gameInfo) {
      return;
    }
    state.games[gameInfo.gameId] = {
      info: gameInfo,
      hostId: data.hostId,
      localPlayerId: data.playerId,
      spectator: data.spectator,
      judge: data.judge,
      resuming: data.resuming,
      started: gameInfo.started,
      activePlayerId: -1,
      activePhase: -1,
      secondsElapsed: 0,
      reversed: false,
      players: {},
      seatOrder: [],
      messages: [],
    };
    state.pings[gameInfo.gameId] = {};
  }) as CaseReducer<GamesState, PayloadAction<{ data: Event_GameJoined }>>,

  gameLeft: ((state, action) => {
    delete state.games[action.payload.gameId];
    delete state.pings[action.payload.gameId];
  }) as CaseReducer<GamesState, PayloadAction<{ gameId: number }>>,

  gameClosed: ((state, action) => {
    const game = state.games[action.payload.gameId];
    // Every stored replay ends with the Event_GameClosed Servatrice recorded when
    // the game was torn down; desktop only logs it and keeps the board.
    if (game?.replay) {
      pushEventMessage(game, EVENT_PLAYER_ID_SYSTEM, formatGameClosed());
      return;
    }
    delete state.games[action.payload.gameId];
    delete state.pings[action.payload.gameId];
  }) as CaseReducer<GamesState, PayloadAction<{ gameId: number }>>,

  kicked: ((state, action) => {
    delete state.games[action.payload.gameId];
    delete state.pings[action.payload.gameId];
  }) as CaseReducer<GamesState, PayloadAction<{ gameId: number }>>,

  /**
   * Creates (or resets, for a rewind) the local game a replay is played into.
   * `gameId` is chosen by the player and must not collide with a server game id;
   * `gameInfo` is the replay's `game_info`. Event containers are then fed through
   * the live game-event pipeline addressed to `gameId`.
   */
  replayGameLoaded: ((state, action) => {
    const { gameId, gameInfo } = action.payload;
    // Desktop logs "You are watching a replay…" once when the tab opens; a
    // rewind (TabGame::resetForRewind) clears the log without repeating it.
    state.games[gameId] = buildReplayGame(gameInfo, !state.games[gameId]?.replay);
    state.pings[gameId] = {};
  }) as CaseReducer<GamesState, PayloadAction<{ gameId: number; gameInfo: ServerInfo_Game }>>,

  replayGameUnloaded: ((state, action) => {
    if (!state.games[action.payload.gameId]?.replay) {
      return;
    }
    delete state.games[action.payload.gameId];
    delete state.pings[action.payload.gameId];
  }) as CaseReducer<GamesState, PayloadAction<{ gameId: number }>>,
};
