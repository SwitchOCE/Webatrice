import { games } from '@cockatrice/datatrice';
import { create } from '@bufbuild/protobuf';
import { Event_SetCounterSchema } from '@cockatrice/sockatrice/generated';
import { act } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';
import { LIFE_COUNTER_ID, renderSeatHook, type SeatGameSpec } from '../../../__test-utils__/seatFixtures';
import { usePlayerCounterCommands } from './usePlayerCounterCommands';

const OGRE = makeCard({
  id: 11,
  name: 'Ogre',
  x: 0,
  y: 0,
  counterList: [{ id: 0, value: 2 }, { id: 3, value: 1 }],
});

const SPEC: SeatGameSpec = { localPlayerId: 1, seats: [{ playerId: 1, table: [OGRE], life: 20 }] };

function renderCounters() {
  const utils = renderSeatHook(() => usePlayerCounterCommands(1), SPEC);
  const player = () => utils.store.getState().games.games[1].players[1];
  const counters = () => player().zones[ZoneName.TABLE].byId[11].counterList.map((c) => [c.id, c.value]);
  return { ...utils, player, counters, commands: () => utils.result()! };
}

describe('usePlayerCounterCommands', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies a delta from the current store value and rolls back to it', () => {
    const { commands, player, game } = renderCounters();
    act(() => commands().increment(LIFE_COUNTER_ID, -5));
    act(() => commands().increment(LIFE_COUNTER_ID, 2));
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(17);

    act(() => vi.mocked(game.incCounter).mock.calls[1][2]!.onError!(1, {} as never));
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(15);
  });

  it('sends a batch as one command container and skips an empty one', () => {
    const { commands, game } = renderCounters();
    commands().setCardCounters([]);
    commands().setCardCounters([{ cardId: 11, counterId: 0, value: 3 }]);
    expect(game.bulkSetCardCounterEntries).toHaveBeenCalledTimes(1);
    expect(game.bulkSetCardCounterEntries).toHaveBeenCalledWith(1, [
      { ownerPlayerId: 1, zone: ZoneName.TABLE, cardId: 11, counterId: 0, counterValue: 3 },
    ]);
  });
});

describe('counter command confirmation', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());
  const echo = (store: ReturnType<typeof renderCounters>['store'], value: number) => act(() => store.dispatch(games.Actions.counterSet({
    gameId: 1, playerId: 1, data: create(Event_SetCounterSchema, { counterId: LIFE_COUNTER_ID, value }),
  })));

  it('settles an unchanged set on success without consuming a later increment', () => {
    const { commands, player, store, game } = renderCounters();
    act(() => {
      commands().set(LIFE_COUNTER_ID, 20);
      commands().increment(LIFE_COUNTER_ID, 1);
    });
    act(() => vi.mocked(game.setCounter).mock.calls[0][2]!.onSuccess?.());
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(21);
    echo(store, 21);
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(21);
    expect(games.isOptimisticPending(games.counterOpKey(1, 1, LIFE_COUNTER_ID))).toBe(false);
    act(() => commands().increment(LIFE_COUNTER_ID, 1));
    act(() => vi.mocked(game.incCounter).mock.calls[0][2]!.onSuccess?.());
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(22);
    echo(store, 22);
    act(() => vi.mocked(game.incCounter).mock.calls[1][2]!.onSuccess?.());
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(22);
  });

  it('settles a zero delta without an echo before confirming a later decrement', () => {
    const { commands, player, store, game } = renderCounters();
    act(() => {
      commands().increment(LIFE_COUNTER_ID, 0);
      commands().increment(LIFE_COUNTER_ID, -1);
    });
    act(() => vi.mocked(game.incCounter).mock.calls[0][2]!.onSuccess?.());
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(19);
    echo(store, 19);
    act(() => vi.mocked(game.incCounter).mock.calls[1][2]!.onSuccess?.());
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(19);
    expect(games.isOptimisticPending(games.counterOpKey(1, 1, LIFE_COUNTER_ID))).toBe(false);
  });

  it('keeps three quick increments visible through interleaved echoes and logs only server values', () => {
    const { commands, player, store } = renderCounters();
    const counts: number[] = [];
    store.subscribe(() => counts.push(player().counters[LIFE_COUNTER_ID].count));
    act(() => commands().increment(LIFE_COUNTER_ID, 1));
    act(() => commands().increment(LIFE_COUNTER_ID, 1));
    expect(store.getState().games.games[1].messages).toHaveLength(0);
    echo(store, 21);
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(22);
    act(() => commands().increment(LIFE_COUNTER_ID, 1));
    echo(store, 22);
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(23);
    echo(store, 23);
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(23);
    expect(counts.every((value, index) => index === 0 || value >= counts[index - 1])).toBe(true);
    expect(store.getState().games.games[1].messages.map(message => message.message)).toEqual([
      'P1 sets counter Life to 21 (+1).', 'P1 sets counter Life to 22 (+1).', 'P1 sets counter Life to 23 (+1).',
    ]);
  });

  it('retains a server update received before a rejected click', () => {
    const { commands, player, store, game } = renderCounters();
    act(() => commands().increment(LIFE_COUNTER_ID, 1));
    echo(store, 40);
    act(() => vi.mocked(game.incCounter).mock.calls[0][2]!.onError!(1, {} as never));
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(40);
  });

  it('removes an exact failed increment while replaying the later increments over the confirmed value', () => {
    const { commands, player, store, game } = renderCounters();
    act(() => {
      commands().increment(LIFE_COUNTER_ID, 1);
      commands().increment(LIFE_COUNTER_ID, 1);
      commands().increment(LIFE_COUNTER_ID, 1);
    });
    echo(store, 30);
    act(() => vi.mocked(game.incCounter).mock.calls[1][2]!.onError!(1, {} as never));
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(31);
    echo(store, 31);
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(31);
  });

  it('isolates counters in two games sharing player and counter ids', () => {
    const { store, result } = renderSeatHook(() => usePlayerCounterCommands(1), SPEC, state => {
      state.games.games[2] = { ...state.games.games[1], info: { ...state.games.games[1].info, gameId: 2 } };
    });
    act(() => result()!.increment(LIFE_COUNTER_ID, 1));
    act(() => store.dispatch(games.Actions.counterSet({
      gameId: 2, playerId: 1, data: create(Event_SetCounterSchema, { counterId: LIFE_COUNTER_ID, value: 50 }),
    })));
    expect(store.getState().games.games[1].players[1].counters[LIFE_COUNTER_ID].count).toBe(21);
    expect(store.getState().games.games[2].players[1].counters[LIFE_COUNTER_ID].count).toBe(50);
    expect(games.isOptimisticPending(games.counterOpKey(1, 1, LIFE_COUNTER_ID))).toBe(true);
    echo(store, 21);
    expect(games.isOptimisticPending(games.counterOpKey(1, 1, LIFE_COUNTER_ID))).toBe(false);
  });

  it('removes counter entries on leave and makes a late rejection harmless', () => {
    const { commands, store, game } = renderCounters();
    act(() => commands().increment(LIFE_COUNTER_ID, 1));
    expect(games.isOptimisticPending(games.counterOpKey(1, 1, LIFE_COUNTER_ID))).toBe(true);
    act(() => store.dispatch(games.Actions.gameLeft({ gameId: 1 })));
    expect(games.isOptimisticPending(games.counterOpKey(1, 1, LIFE_COUNTER_ID))).toBe(false);
    const state = store.getState();
    act(() => vi.mocked(game.incCounter).mock.calls[0][2]!.onError!(1, {} as never));
    expect(store.getState()).toBe(state);
  });

  it('replays mixed absolute sets and increments and accepts the final server value', () => {
    const { commands, player, store, game } = renderCounters();
    act(() => {
      commands().set(LIFE_COUNTER_ID, 25);
      commands().increment(LIFE_COUNTER_ID, 2);
      commands().set(LIFE_COUNTER_ID, 50);
      commands().increment(LIFE_COUNTER_ID, 3);
    });
    act(() => vi.mocked(game.setCounter).mock.calls[1][2]!.onError!(1, {} as never));
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(30);
    echo(store, 26);
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(31);
    echo(store, 28);
    echo(store, 32);
    expect(player().counters[LIFE_COUNTER_ID].count).toBe(32);
  });
});
