import { create } from '@bufbuild/protobuf';
import { act, renderHook } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';

import { games, server } from '@cockatrice/datatrice';
import { makeGameEntry, makePlayerEntry, makePlayerProperties, makeServerState } from '@cockatrice/datatrice/testing';
import {
  ServerInfo_PlayerPropertiesSchema,
  ServerInfo_PlayerProperties_PlaymatParamsSchema,
} from '@cockatrice/sockatrice/generated';
import {
  DEFAULT_PLAYMAT_SETTINGS,
  PlaymatFallbackBehavior,
  PlaymatMode,
  PlaymatVisibility,
  setPlaymatSettings,
} from '@app/hooks';

import { makeReduxWebClientHookWrapper } from '../../../__test-utils__/makeHookWrapper';
import { prunePlaymatSyncState } from './playmatSyncState';
import { usePlaymatSync } from './usePlaymatSync';

const PARAMS = { marginPctL: 0.07, marginPctR: 0.07, verticalOffset: 0.33, zoom: 1 };
const mat = (cardName: string) => ({ cardName, cardProviderId: '', params: PARAMS });

function setup({ version = '3.1.0 ()', spectator = false } = {}) {
  const player = makePlayerEntry({ properties: makePlayerProperties({ playerId: 1 }) });
  // A second game where the same deck playmat 'A' is already announced.
  const inGame2 = makePlayerEntry({
    properties: makePlayerProperties({
      playerId: 1,
      deckHash: 'h2',
      playmatParams: create(ServerInfo_PlayerProperties_PlaymatParamsSchema, { cardName: 'A' }),
    }),
  });
  const { Wrapper, store, webClient } = makeReduxWebClientHookWrapper({
    reducer: combineReducers({ games: games.gamesReducer, server: server.serverReducer }),
    preloadedState: {
      games: {
        games: {
          1: makeGameEntry({ localPlayerId: 1, spectator, players: { 1: player } }),
          2: makeGameEntry({ localPlayerId: 1, players: { 1: inGame2 } }),
        },
        pings: {},
      },
      server: makeServerState({ info: { message: null, name: 'Servatrice', version } }),
    } as any,
  });
  const hook = renderHook(({ gameId }) => usePlaymatSync(gameId), { wrapper: Wrapper, initialProps: { gameId: 1 } });
  // What Servatrice sends back for a deck select (and a SetPlaymat echo).
  const announce = (properties: Parameters<typeof create<typeof ServerInfo_PlayerPropertiesSchema>>[1]) =>
    act(() => {
      store.dispatch(games.Actions.playerPropertiesUpdated({
        gameId: 1,
        playerId: 1,
        properties: create(ServerInfo_PlayerPropertiesSchema, properties),
      }));
    });
  const setPlaymat = webClient.request.game.setPlaymat as ReturnType<typeof vi.fn>;
  // Leaving `/game/:id` (for Settings, say) unmounts the Game route; coming back mounts it again.
  const remount = () => renderHook(() => usePlaymatSync(1), { wrapper: Wrapper });
  // One game of the match: ready, the server starts it (clearing ready), then it ends.
  const playGame = () => {
    announce({ readyStart: true });
    act(() => {
      store.dispatch(games.Actions.gameInfoUpdated({ gameId: 1, gameStarted: true }));
    });
    announce({ readyStart: false });
    act(() => {
      store.dispatch(games.Actions.gameInfoUpdated({ gameId: 1, gameStarted: false }));
    });
  };
  return { hook, store, announce, setPlaymat, remount, playGame };
}

describe('usePlaymatSync', () => {
  afterEach(() => {
    act(() => setPlaymatSettings(DEFAULT_PLAYMAT_SETTINGS));
    prunePlaymatSyncState([]);
    vi.clearAllMocks();
  });

  it('sends nothing before a deck is selected', () => {
    act(() => setPlaymatSettings({ fallbackList: [mat('A')] }));
    const { setPlaymat } = setup();
    expect(setPlaymat).not.toHaveBeenCalled();
  });

  it('keeps the deck\'s own playmat in fallback mode', () => {
    act(() => setPlaymatSettings({ fallbackList: [mat('A')] }));
    const { announce, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: 'Deck Mat' } });
    expect(setPlaymat).not.toHaveBeenCalled();
  });

  it('announces the collection\'s pick when the deck has no playmat', () => {
    act(() => setPlaymatSettings({ fallbackList: [mat('A')] }));
    const { announce, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: '' } });
    expect(setPlaymat).toHaveBeenCalledExactlyOnceWith(1, {
      playmatParams: { cardName: 'A', cardProviderId: '', ...PARAMS },
    });

    // The server's echo of our own playmat is not a new deck.
    announce({ playmatParams: { cardName: 'A' } });
    expect(setPlaymat).toHaveBeenCalledTimes(1);
  });

  it('re-applies an override when reselecting the deck resets the playmat', () => {
    act(() => setPlaymatSettings({ mode: PlaymatMode.OVERRIDE_DECK, fallbackList: [mat('A')] }));
    const { announce, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: 'Deck Mat' } });
    announce({ playmatParams: { cardName: 'A' } });
    announce({ deckHash: 'h1', playmatParams: { cardName: 'Deck Mat' } });
    expect(setPlaymat).toHaveBeenCalledTimes(2);
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'A' }) });
  });

  it('clears the deck playmat when overriding with an empty collection', () => {
    act(() => setPlaymatSettings({ mode: PlaymatMode.OVERRIDE_DECK }));
    const { announce, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: 'Deck Mat' } });
    expect(setPlaymat).toHaveBeenCalledExactlyOnceWith(1, { playmatParams: { cardName: '' } });
  });

  it('re-resolves for the loaded deck when the settings change', () => {
    const { announce, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: 'Deck Mat' } });
    expect(setPlaymat).not.toHaveBeenCalled();

    act(() => setPlaymatSettings({ mode: PlaymatMode.OVERRIDE_DECK, fallbackList: [mat('B')] }));
    expect(setPlaymat).toHaveBeenCalledExactlyOnceWith(1, { playmatParams: expect.objectContaining({ cardName: 'B' }) });

    announce({ playmatParams: { cardName: 'B' } });

    // Back to fallback: the deck's own playmat returns.
    act(() => setPlaymatSettings({ mode: PlaymatMode.FALLBACK }));
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'Deck Mat' }) });
  });

  it('advances the round-robin cursor on the next game\'s Ready without a deck reselect', () => {
    act(() => setPlaymatSettings({
      fallbackBehavior: PlaymatFallbackBehavior.ROUND_ROBIN,
      fallbackList: [mat('A'), mat('B')],
    }));
    const { announce, playGame, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: '' } });
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'A' }) });
    announce({ playmatParams: { cardName: 'A' } });

    // Game 1: Ready re-resolves to the same pick, so nothing new is sent.
    playGame();
    expect(setPlaymat).toHaveBeenCalledTimes(1);

    // Game 2 keeps the deck (same hash); its Ready picks the next entry.
    announce({ readyStart: true });
    expect(setPlaymat).toHaveBeenCalledTimes(2);
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'B' }) });
  });

  it('re-rolls a random pick on Ready, never repeating the previous one', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    act(() => setPlaymatSettings({
      fallbackBehavior: PlaymatFallbackBehavior.RANDOM,
      fallbackList: [mat('A'), mat('B')],
    }));
    const { announce, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: '' } });
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'A' }) });
    announce({ playmatParams: { cardName: 'A' } });

    announce({ readyStart: true });
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'B' }) });
    vi.restoreAllMocks();
  });

  it('does not re-roll when only the visibility changes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    act(() => setPlaymatSettings({
      fallbackBehavior: PlaymatFallbackBehavior.RANDOM,
      fallbackList: [mat('A'), mat('B')],
    }));
    const { announce, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: '' } });
    announce({ playmatParams: { cardName: 'A' } });

    act(() => setPlaymatSettings({ visibility: PlaymatVisibility.OWN_ONLY }));
    expect(setPlaymat).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('keeps the deck\'s playmat across leaving and returning to the game', () => {
    act(() => setPlaymatSettings({ mode: PlaymatMode.OVERRIDE_DECK, fallbackList: [mat('A')] }));
    const { hook, announce, remount, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: 'Deck Mat' } });
    announce({ playmatParams: { cardName: 'A' } });
    expect(setPlaymat).toHaveBeenCalledTimes(1);

    hook.unmount();
    act(() => setPlaymatSettings({ mode: PlaymatMode.DECK_ONLY }));
    remount();

    // 'A' is the echo of what was sent, not the deck's playmat.
    expect(setPlaymat).toHaveBeenCalledTimes(2);
    expect(setPlaymat).toHaveBeenLastCalledWith(1, {
      playmatParams: expect.objectContaining({ cardName: 'Deck Mat' }),
    });
  });

  it('keeps the round-robin cursor across leaving and returning to the game', () => {
    act(() => setPlaymatSettings({
      fallbackBehavior: PlaymatFallbackBehavior.ROUND_ROBIN,
      fallbackList: [mat('A'), mat('B')],
    }));
    const { hook, announce, playGame, remount, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: '' } });
    announce({ playmatParams: { cardName: 'A' } });
    playGame();

    hook.unmount();
    remount();
    expect(setPlaymat).toHaveBeenCalledTimes(1);

    announce({ readyStart: true });
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'B' }) });
  });

  it('starts each game from a clean slate', () => {
    act(() => setPlaymatSettings({ fallbackList: [mat('A')] }));
    const { hook, setPlaymat, announce } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: '' } });
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'A' }) });

    // In game 2 'A' is that deck's own playmat, not an echo of what game 1 was sent,
    // so deck-only mode keeps it rather than clearing it.
    hook.rerender({ gameId: 2 });
    act(() => setPlaymatSettings({ mode: PlaymatMode.DECK_ONLY }));
    expect(setPlaymat).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a server without playmats', () => {
    act(() => setPlaymatSettings({ fallbackList: [mat('A')] }));
    const { announce, setPlaymat } = setup({ version: '3.0.0 ()' });
    announce({ deckHash: 'h1' });
    expect(setPlaymat).not.toHaveBeenCalled();
  });

  it('does nothing for a spectator', () => {
    act(() => setPlaymatSettings({ fallbackList: [mat('A')] }));
    const { announce, setPlaymat } = setup({ spectator: true });
    announce({ deckHash: 'h1' });
    expect(setPlaymat).not.toHaveBeenCalled();
  });
});
