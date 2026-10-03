import { ZoneName } from '@cockatrice/sockatrice';
import { renderHook } from '@testing-library/react';

import { makeDialogTestEnv, makeDialogTestGame, makeSetterSpies } from '../../__test-utils__/dialogTestEnv';
import type { PromptState } from './gameDialogs.types';
import { useHandDialogActions } from './useHandDialogActions';

function setup({ canOpenMenus = true, hand = [7, 8, 9] } = {}) {
  const { env, webClient } = makeDialogTestEnv(makeDialogTestGame({ deckCount: 50, hand }));
  const set = makeSetterSpies();
  const closeAllContextMenus = vi.fn();
  const openZoneView = vi.fn();
  const { result } = renderHook(() =>
    useHandDialogActions({ env, canOpenMenus, set, closeAllContextMenus, openZoneView }));
  const lastPrompt = () => set.setPrompt.mock.calls.at(-1)?.[0] as PromptState;
  return { result, set, webClient, closeAllContextMenus, openZoneView, lastPrompt };
}

const event = () => ({ preventDefault: vi.fn(), clientX: 5, clientY: 6 }) as unknown as React.MouseEvent;

describe('useHandDialogActions', () => {
  it('opens the hand menu after closing the others, unless the user may not act', () => {
    const open = setup();
    open.result.current.handleHandContextMenu(event());
    expect(open.closeAllContextMenus).toHaveBeenCalled();
    expect(open.set.setHandMenu).toHaveBeenCalledWith({ top: 6, left: 5 });

    const blocked = setup({ canOpenMenus: false });
    blocked.result.current.handleHandContextMenu(event());
    expect(blocked.set.setHandMenu).not.toHaveBeenCalled();
  });

  it('bounds the mulligan prompt by hand + library and resolves 0 and below against the hand size', () => {
    const { result, webClient, lastPrompt } = setup();

    result.current.handleRequestChooseMulligan();
    expect(lastPrompt().initialValue).toBe('7');
    expect(lastPrompt().validate?.('54')).toBe('Enter an integer between -3 and 53.');
    lastPrompt().onSubmit('-1');

    expect(webClient.request.game.mulligan).toHaveBeenCalledWith(1, { number: 2 });
  });

  it('views the hand through the zone-view stack', () => {
    const { result, openZoneView } = setup();
    result.current.handleRequestViewHand();
    expect(openZoneView).toHaveBeenCalledWith(1, ZoneName.HAND);
  });

  it('moves the whole hand to the bottom of the library one card at a time', () => {
    const { result, webClient } = setup({ hand: [7, 8] });

    result.current.handleRequestMoveHandToDeck(false);

    expect(vi.mocked(webClient.request.game.moveCard).mock.calls.map(([, p]) => [p.cardsToMove, p.x])).toEqual([
      [{ card: [{ cardId: 7 }] }, -1],
      [{ card: [{ cardId: 8 }] }, -1],
    ]);
  });
});
