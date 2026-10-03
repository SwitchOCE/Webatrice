import { ZoneName } from '@cockatrice/sockatrice';
import { renderHook } from '@testing-library/react';

import { makeDialogTestEnv, makeDialogTestGame, makeSetterSpies } from '../../__test-utils__/dialogTestEnv';
import type { PromptState } from './gameDialogs.types';
import { useLibraryDialogActions } from './useLibraryDialogActions';

function setup(deckCount = 40) {
  const { env, webClient } = makeDialogTestEnv(makeDialogTestGame({ deckCount }));
  const set = makeSetterSpies();
  const { result } = renderHook(() => useLibraryDialogActions({ env, set }));
  const lastPrompt = () => set.setPrompt.mock.calls.at(-1)?.[0] as PromptState;
  return { result, set, webClient, lastPrompt };
}

describe('useLibraryDialogActions', () => {
  it('moves the top N cards as positions N-1..0, clamped to the library', () => {
    const { result, webClient, lastPrompt } = setup(2);

    result.current.handleRequestMoveTopNToZone(ZoneName.GRAVE);
    expect(lastPrompt().title).toBe('Move top N cards to graveyard');
    lastPrompt().onSubmit('5');

    expect(webClient.request.game.moveCard).toHaveBeenCalledWith(1, {
      startPlayerId: 1,
      startZone: ZoneName.DECK,
      cardsToMove: { card: [{ cardId: 1 }, { cardId: 0 }] },
      targetPlayerId: 1,
      targetZone: ZoneName.GRAVE,
      x: 0,
      y: 0,
      isReversed: false,
    });
  });

  it('draws the bottom card by its position, and does nothing on an empty library', () => {
    const { result, webClient } = setup(30);
    result.current.handleRequestDrawBottom();
    expect(vi.mocked(webClient.request.game.moveCard).mock.calls[0][1].cardsToMove).toEqual({ card: [{ cardId: 29 }] });

    const empty = setup(0);
    empty.result.current.handleRequestDrawBottom();
    expect(empty.webClient.request.game.moveCard).not.toHaveBeenCalled();
  });

  it('shuffles the bottom N with a negative start', () => {
    const { result, webClient, lastPrompt } = setup();

    result.current.handleRequestShuffleBottomN();
    expect(lastPrompt().validate?.('0')).toBe('Enter a positive integer');
    lastPrompt().onSubmit('3');

    expect(webClient.request.game.shuffle).toHaveBeenCalledWith(1, { zoneName: ZoneName.DECK, start: -3, end: -1 });
  });
});
