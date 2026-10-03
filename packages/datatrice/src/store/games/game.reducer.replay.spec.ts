import { create } from '@bufbuild/protobuf';
import { configureStore } from '@reduxjs/toolkit';
import {
  Event_RevealCardsSchema,
  ServerInfo_CardSchema,
  ServerInfo_GameSchema,
} from '@cockatrice/sockatrice/generated';

import { Actions as ServerActions } from '../server/server.actions';
import { listenerMiddleware } from '../listenerMiddleware';
import { Actions } from './game.actions';
import { registerGameListeners } from './game.listeners';
import { gamesReducer } from './game.reducer';
import { GamesState } from './game.interfaces';
import { Selectors } from './game.selectors';
import { makeGameEntry, makePlayerEntry, makeState, makeZoneEntry } from '../../testing/fixtures/games';

registerGameListeners(listenerMiddleware);

const REPLAY_ID = -1000;

function replayInfo(gameId = 77) {
  return create(ServerInfo_GameSchema, { gameId, description: 'Recorded game', started: false });
}

function withReplay(state: GamesState = makeState()): GamesState {
  return gamesReducer(state, Actions.replayGameLoaded({ gameId: REPLAY_ID, gameInfo: replayInfo() }));
}

describe('replay game lifecycle', () => {
  it('replayGameLoaded creates an omniscient, player-less spectator game flagged as a replay', () => {
    const game = withReplay().games[REPLAY_ID];

    expect(game.replay).toBe(true);
    expect(game.localPlayerId).toBe(-1);
    expect(game.spectator).toBe(true);
    expect(game.judge).toBe(false);
    expect(game.started).toBe(false);
    expect(game.activePhase).toBe(-1);
    expect(game.players).toEqual({});
    expect(game.info.gameId).toBe(77);
    expect(game.info.spectatorsOmniscient).toBe(true);
    expect(game.messages.map((m) => m.message)).toEqual(['You are watching a replay of game #77.']);
  });

  it('replayGameLoaded on an existing replay resets it for a rewind', () => {
    let state = withReplay();
    state = gamesReducer(state, Actions.gameSay({ gameId: REPLAY_ID, playerId: 0, message: 'gg', timeReceived: 1 }));
    expect(state.games[REPLAY_ID].messages).toHaveLength(2);

    state = withReplay(state);
    expect(state.games[REPLAY_ID].messages).toHaveLength(1);
    expect(state.pings[REPLAY_ID]).toEqual({});
  });

  it('gameClosed keeps a replay on the board and logs the close', () => {
    const state = gamesReducer(withReplay(), Actions.gameClosed({ gameId: REPLAY_ID }));

    expect(state.games[REPLAY_ID]).toBeDefined();
    expect(state.games[REPLAY_ID].messages.at(-1)?.message).toBe('The game has been closed.');
  });

  it('gameClosed still removes a server game', () => {
    const state = gamesReducer(withReplay(), Actions.gameClosed({ gameId: 1 }));
    expect(state.games[1]).toBeUndefined();
  });

  it('replayGameUnloaded removes only replay games', () => {
    let state = withReplay();
    state = gamesReducer(state, Actions.replayGameUnloaded({ gameId: 1 }));
    expect(state.games[1]).toBeDefined();

    state = gamesReducer(state, Actions.replayGameUnloaded({ gameId: REPLAY_ID }));
    expect(state.games[REPLAY_ID]).toBeUndefined();
    expect(state.pings[REPLAY_ID]).toBeUndefined();
  });

  it('clearStore and disconnect drop server games but keep a replay being watched', () => {
    const cleared = gamesReducer(withReplay(), Actions.clearStore());
    expect(Object.keys(cleared.games).map(Number)).toEqual([REPLAY_ID]);

    const disconnected = gamesReducer(withReplay(), ServerActions.disconnected());
    expect(Object.keys(disconnected.games).map(Number)).toEqual([REPLAY_ID]);
    expect(disconnected.incomingReveal).toBeNull();
  });
});

describe('replay games and the active-game selectors', () => {
  it('excludes replay games from the active game ids and entries', () => {
    const state = { games: makeState({ games: { 1: makeGameEntry(), [REPLAY_ID]: makeGameEntry({ replay: true }) } }) };

    expect(Selectors.getActiveGameIds(state)).toEqual([1]);
    expect(Selectors.getActiveGames(state)).toHaveLength(1);
    expect(Selectors.getIsReplayGame(state, REPLAY_ID)).toBe(true);
    expect(Selectors.getIsReplayGame(state, 1)).toBe(false);
  });
});

describe('replay games and incoming reveals', () => {
  function revealInto(replay: boolean) {
    const card = create(ServerInfo_CardSchema, { id: 4, name: 'Island' });
    const game = makeGameEntry({
      replay,
      players: { 1: makePlayerEntry({ zones: { hand: makeZoneEntry({ name: 'hand', cards: [card], cardCount: 1 }) } }) },
    });
    const store = configureStore({
      preloadedState: { games: makeState({ games: { [REPLAY_ID]: game } }) },
      reducer: { games: gamesReducer },
      middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false })
        .prepend(listenerMiddleware.middleware),
    });
    store.dispatch(Actions.cardsRevealed({
      gameId: REPLAY_ID,
      playerId: 1,
      data: create(Event_RevealCardsSchema, { zoneName: 'hand', cardId: [4], cards: [card] }),
    }));
    return store.getState().games.incomingReveal ?? null;
  }

  it('does not raise the receiver dialog for a recorded reveal', () => {
    expect(revealInto(false)).not.toBeNull();
    expect(revealInto(true)).toBeNull();
  });
});
