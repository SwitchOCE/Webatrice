import { renderHook } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';

import type { SeatSelection } from '../../../hooks/useSeatSelection';
import type { PlayerCardViewModel, PlayerZoneCommands } from './playerBoard.types';
import { useHandCardOps, type UseHandCardOpsArgs } from './useHandCardOps';

const card = (id: string, name: string): PlayerCardViewModel => ({ id, name, scryfallId: `p${id}` });
const HAND = [card('30', 'Shock'), card('31', 'Forest'), card('32', 'Ogre')];
const hand = (...ids: string[]): SeatSelection => ({ zone: 'hand', ids: new Set(ids) });

function setup(args: Partial<UseHandCardOpsArgs> = {}) {
  const zoneCommands = { moveCards: vi.fn() } as unknown as PlayerZoneCommands;
  const props: UseHandCardOpsArgs = {
    cards: HAND,
    selection: hand('31', '32'),
    cardMetaByName: new Map([
      ['Shock', { typeLine: 'Instant' }],
      ['Forest', { typeLine: 'Basic Land — Forest' }],
      ['Ogre', { typeLine: 'Creature — Ogre', pt: '3/3' }],
    ]),
    zoneCommands,
    ...args,
  };
  const { result } = renderHook(() => useHandCardOps(props));
  return { ops: result.current, moveCards: vi.mocked(zoneCommands.moveCards) };
}

describe('useHandCardOps', () => {
  it('plays each selected card where the hand menu\'s Play sends it, highest id first', () => {
    const { ops, moveCards } = setup();
    ops.forSelection()!.play(false);
    // Positional ids shift as cards leave the hand; "Play to stack" (on by default) stacks the creature.
    expect(moveCards.mock.calls).toEqual([
      [ZoneName.HAND, [32], { zone: ZoneName.STACK, index: 'end' }],
      [ZoneName.HAND, [31], { zone: ZoneName.TABLE, index: 'end', row: expect.any(Number) }],
    ]);
  });

  it('plays face down, and sends an instant to the stack face up', () => {
    const { ops, moveCards } = setup({ selection: hand('30') });
    ops.forSelection()!.play(true);
    ops.forSelection()!.play(false);
    expect(moveCards.mock.calls.map(([, cards, to]) => [cards, to.zone])).toEqual([
      [[{ id: 30, faceDown: true }], ZoneName.TABLE],
      [[30], ZoneName.STACK],
    ]);
  });

  it('moves the selection in one command', () => {
    const { ops, moveCards } = setup();
    ops.forSelection()!.move({ zone: ZoneName.EXILE });
    expect(moveCards).toHaveBeenCalledExactlyOnceWith(ZoneName.HAND, [31, 32], { zone: ZoneName.EXILE, reversed: false });
  });

  it('has nothing to act on without a hand selection', () => {
    expect(setup({ selection: null }).ops.forSelection()).toBeNull();
    expect(setup({ selection: { zone: 'battlefield', ids: new Set(['31']) } }).ops.forSelection()).toBeNull();
    expect(setup({ selection: hand('99') }).ops.forSelection()).toBeNull();
  });
});
