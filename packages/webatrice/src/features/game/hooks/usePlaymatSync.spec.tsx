import { create } from '@bufbuild/protobuf';
import { act, renderHook } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';

import { games, server } from '@cockatrice/datatrice';
import { makeGameEntry, makePlayerEntry, makePlayerProperties, makeServerState } from '@cockatrice/datatrice/testing';
import { ServerInfo_PlayerPropertiesSchema } from '@cockatrice/sockatrice/generated';
import {
  DEFAULT_PLAYMAT_SETTINGS,
  PlaymatFallbackBehavior,
  PlaymatMode,
  setPlaymatSettings,
} from '@app/hooks';

import { makeReduxWebClientHookWrapper } from '../../../__test-utils__/makeHookWrapper';
import { usePlaymatSync } from './usePlaymatSync';

const PARAMS = { marginPctL: 0.07, marginPctR: 0.07, verticalOffset: 0.33, zoom: 1 };
const mat = (cardName: string) => ({ cardName, cardProviderId: '', params: PARAMS });

function setup({ version = '3.1.0 ()', spectator = false } = {}) {
  const player = makePlayerEntry({ properties: makePlayerProperties({ playerId: 1 }) });
  const { Wrapper, store, webClient } = makeReduxWebClientHookWrapper({
    reducer: combineReducers({ games: games.gamesReducer, server: server.serverReducer }),
    preloadedState: {
      games: { games: { 1: makeGameEntry({ localPlayerId: 1, spectator, players: { 1: player } }) }, pings: {} },
      server: makeServerState({ info: { message: null, name: 'Servatrice', version } }),
    } as any,
  });
  const hook = renderHook(() => usePlaymatSync(1), { wrapper: Wrapper });
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
  return { hook, store, announce, setPlaymat };
}

describe('usePlaymatSync', () => {
  afterEach(() => {
    act(() => setPlaymatSettings(DEFAULT_PLAYMAT_SETTINGS));
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

  it('advances the round-robin cursor when a game ends', () => {
    act(() => setPlaymatSettings({
      fallbackBehavior: PlaymatFallbackBehavior.ROUND_ROBIN,
      fallbackList: [mat('A'), mat('B')],
    }));
    const { announce, store, setPlaymat } = setup();
    announce({ deckHash: 'h1', playmatParams: { cardName: '' } });
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'A' }) });

    act(() => {
      store.dispatch(games.Actions.gameInfoUpdated({ gameId: 1, gameStarted: true }));
    });
    act(() => {
      store.dispatch(games.Actions.gameInfoUpdated({ gameId: 1, gameStarted: false }));
    });
    announce({ deckHash: 'h2', playmatParams: { cardName: '' } });
    expect(setPlaymat).toHaveBeenLastCalledWith(1, { playmatParams: expect.objectContaining({ cardName: 'B' }) });
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
