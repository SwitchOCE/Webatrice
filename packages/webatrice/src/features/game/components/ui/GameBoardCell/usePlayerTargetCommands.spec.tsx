import { act } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { Event_CreateArrowSchema } from '@cockatrice/sockatrice/generated';
import { ZoneName } from '@cockatrice/sockatrice';
import { makeArrow } from '@cockatrice/datatrice/testing';
import { games } from '@cockatrice/datatrice';
import { ArrowColor } from '@app/types';
import { renderSeatHook, type SeatGameSpec } from '../../../__test-utils__/seatFixtures';
import { usePlayerTargetCommands } from './usePlayerTargetCommands';

const SPEC: SeatGameSpec = { localPlayerId: 1, seats: [{ playerId: 1 }, { playerId: 2 }] };

function renderTargets() {
  const utils = renderSeatHook(() => usePlayerTargetCommands(1), SPEC, (state) => {
    state.games!.games![1]!.players![1]!.arrows = { 5: makeArrow({ id: 5 }) };
    state.games!.games![1]!.players![2]!.arrows = { 9: makeArrow({ id: 9 }) };
  });
  return { ...utils, commands: () => utils.result()! };
}

describe('usePlayerTargetCommands', () => {
  it('omits every target field for an unattach and for a player-targeted arrow', () => {
    const { commands, game } = renderTargets();
    commands().unattach(10);
    commands().createArrow(10, ZoneName.EXILE, { kind: 'player', playerId: 2 });

    expect(vi.mocked(game.attachCard).mock.calls[0][1]).toEqual({ startZone: ZoneName.TABLE, cardId: 10 });
    expect(vi.mocked(game.createArrow).mock.calls[0][1]).toEqual({
      startPlayerId: 1,
      startZone: ZoneName.EXILE,
      startCardId: 10,
      targetPlayerId: 2,
      arrowColor: ArrowColor.RED,
    });
  });

  it('clears only this player\'s arrows, as they are when the command runs', () => {
    const { commands, game, store } = renderTargets();
    act(() => {
      store.dispatch(games.Actions.arrowCreated({
        gameId: 1,
        playerId: 1,
        data: create(Event_CreateArrowSchema, { arrowInfo: makeArrow({ id: 6 }) }),
      }));
    });
    commands().clearOwnArrows();
    expect(vi.mocked(game.deleteArrow).mock.calls.map(([, p]) => p)).toEqual([{ arrowId: 5 }, { arrowId: 6 }]);
  });
});
