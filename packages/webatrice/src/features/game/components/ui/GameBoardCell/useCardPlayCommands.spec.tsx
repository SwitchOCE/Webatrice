import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';

import { renderSeatHook } from '../../../__test-utils__/seatFixtures';
import { useCardPlayCommands } from './useCardPlayCommands';

vi.mock('../../../../../hooks/useSettings');

// tablerow 3: an instant, which the play chain sends to the stack.
vi.mock('../../../../../services/dexie/DexieDTOs/CardDTO', () => ({
  CardDTO: { get: vi.fn(async () => ({ tablerow: { value: '3' } })) },
}));

const BEAR = makeCard({ id: 20, name: 'Bear' });
const SHOCK = makeCard({ id: 30, name: 'Shock' });

describe('useCardPlayCommands', () => {
  it('taps with the judge resolver, which wraps another player\'s card as its owner', () => {
    const { result, game } = renderSeatHook(
      () => useCardPlayCommands(1),
      { localPlayerId: 3, judge: true, seats: [{ playerId: 1 }, { playerId: 2, table: [BEAR] }] },
    );
    const targets = [{ ownerPlayerId: 2, zone: ZoneName.TABLE, card: BEAR }];
    result()!.tap(targets);

    const [gameId, sent, judgeTarget] = vi.mocked(game.bulkTap).mock.calls[0];
    expect([gameId, sent]).toEqual([1, targets]);
    expect([judgeTarget!(2), judgeTarget!(3)]).toEqual([2, undefined]);
  });

  it('plays a hand card along the double-click chain, as its owner', async () => {
    const { result, game } = renderSeatHook(
      () => useCardPlayCommands(1),
      { localPlayerId: 3, judge: true, seats: [{ playerId: 1, hand: [SHOCK] }, { playerId: 2 }] },
    );
    result()!.autoPlay(1, ZoneName.HAND, SHOCK);

    await vi.waitFor(() => expect(game.moveCard).toHaveBeenCalled());
    expect(vi.mocked(game.moveCard).mock.calls[0]).toEqual([1, expect.objectContaining({
      startPlayerId: 1,
      startZone: ZoneName.HAND,
      targetPlayerId: 1,
      targetZone: ZoneName.STACK,
    }), 1]);
  });

  it('is undefined until the game id is known', () => {
    const { result } = renderSeatHook(() => useCardPlayCommands(undefined), { localPlayerId: 1, seats: [{ playerId: 1 }] });
    expect(result()).toBeUndefined();
  });
});
