import { renderHook } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';

import type { PlayerZoneCommands } from './playerBoard.types';
import { useLibraryOps } from './useLibraryOps';

function setup(deckCount = 5) {
  const zoneCommands = { moveCards: vi.fn(), shuffleLibrary: vi.fn() } as unknown as PlayerZoneCommands;
  const openCountPrompt = vi.fn();
  const { result } = renderHook(() => useLibraryOps({ deckCount, openCountPrompt, zoneCommands }));
  /** Submit the latest count prompt with `n`. */
  const submit = (n: number) => openCountPrompt.mock.lastCall![0].onSubmit(n);
  return { ops: result.current, openCountPrompt, submit, zoneCommands };
}

describe('useLibraryOps', () => {
  it('addresses the top card as 0 and the bottom card by position', () => {
    const { ops, zoneCommands } = setup();
    ops.moveTopCard(ZoneName.TABLE, 'end', true);
    ops.moveBottomCard(ZoneName.HAND, 0);
    expect(vi.mocked(zoneCommands.moveCards).mock.calls).toEqual([
      [ZoneName.DECK, [{ id: 0, faceDown: true }], { zone: ZoneName.TABLE, index: 'end' }],
      [ZoneName.DECK, [4], { zone: ZoneName.HAND, index: 0 }],
    ]);
  });

  it('moves N top or bottom cards in desktop\'s order, clamped to the library', () => {
    const { ops, openCountPrompt, submit, zoneCommands } = setup();
    ops.promptMoveTopCards('Move top cards to exile', ZoneName.EXILE, true);
    expect(openCountPrompt).toHaveBeenLastCalledWith(expect.objectContaining({
      title: 'Move top cards to exile', submitLabel: 'Move', deckSize: 5,
    }));
    submit(2);
    ops.promptMoveBottomCards('Draw bottom cards', 'Draw', ZoneName.HAND);
    submit(9);
    expect(vi.mocked(zoneCommands.moveCards).mock.calls).toEqual([
      [ZoneName.DECK, [{ id: 1, faceDown: true }, { id: 0, faceDown: true }], { zone: ZoneName.EXILE }],
      [ZoneName.DECK, [0, 1, 2, 3, 4], { zone: ZoneName.HAND }],
    ]);
  });

  it('shuffles the top N inclusively and the bottom N by negative positions', () => {
    const { ops, submit, zoneCommands } = setup();
    ops.promptShuffleTopCards();
    submit(3);
    ops.promptShuffleBottomCards();
    submit(2);
    expect(vi.mocked(zoneCommands.shuffleLibrary).mock.calls).toEqual([[{ start: 0, end: 2 }], [{ start: -2, end: -1 }]]);
  });

  it('does nothing on an empty library, or for a count of zero', () => {
    const empty = setup(0);
    empty.ops.moveTopCard(ZoneName.GRAVE, 0);
    empty.ops.moveBottomCard(ZoneName.GRAVE, 0);
    empty.ops.promptMoveTopCards('Move', ZoneName.GRAVE);
    empty.ops.promptShuffleBottomCards();
    expect(empty.zoneCommands.moveCards).not.toHaveBeenCalled();
    expect(empty.openCountPrompt).not.toHaveBeenCalled();

    const zero = setup();
    zero.ops.promptMoveTopCards('Move', ZoneName.GRAVE);
    zero.submit(0);
    expect(zero.zoneCommands.moveCards).not.toHaveBeenCalled();
  });
});
