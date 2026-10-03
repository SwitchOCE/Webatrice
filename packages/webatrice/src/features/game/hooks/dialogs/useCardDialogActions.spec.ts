import { ZoneName } from '@cockatrice/sockatrice';
import { makeCard } from '@cockatrice/datatrice/testing';
import { renderHook } from '@testing-library/react';

import { makeDialogTestEnv, makeSetterSpies } from '../../__test-utils__/dialogTestEnv';
import type { CardMenuState, PromptState } from './gameDialogs.types';
import { useCardDialogActions } from './useCardDialogActions';

function setup(cardMenu: CardMenuState | null) {
  const { env, webClient } = makeDialogTestEnv();
  const set = makeSetterSpies();
  const args = {
    env,
    cardMenu,
    set,
    closeAllContextMenus: vi.fn(),
    invertVerticalCoordinate: false,
    startPendingArrow: vi.fn(),
    startPendingAttach: vi.fn(),
    collapseUnlessSelected: vi.fn(),
    getSelectedCards: () => [],
  };
  const { result } = renderHook(() => useCardDialogActions(args));
  const lastPrompt = () => set.setPrompt.mock.calls.at(-1)?.[0] as PromptState;
  return { result, set, webClient, args, lastPrompt };
}

const menuFor = (card = makeCard({ id: 4, pt: '1/1' })): CardMenuState => ({
  card,
  sourcePlayerId: 1,
  sourceZone: ZoneName.TABLE,
  anchorPosition: { top: 0, left: 0 },
});

describe('useCardDialogActions', () => {
  it('collapses the selection and closes other menus before opening the card menu', () => {
    const { result, set, args } = setup(null);
    const card = makeCard({ id: 4 });
    const event = { preventDefault: vi.fn(), clientX: 1, clientY: 2 } as unknown as React.MouseEvent;

    result.current.handleCardContextMenu(1, ZoneName.TABLE, card, event);

    expect(args.collapseUnlessSelected).toHaveBeenCalledWith(1, ZoneName.TABLE, card);
    expect(args.closeAllContextMenus).toHaveBeenCalled();
    expect(set.setCardMenu).toHaveBeenCalledWith({
      card,
      sourcePlayerId: 1,
      sourceZone: ZoneName.TABLE,
      anchorPosition: { top: 2, left: 1 },
    });
  });

  it('ignores a right-click with no owner or zone', () => {
    const { result, set } = setup(null);
    result.current.handleCardContextMenu(undefined, ZoneName.TABLE, makeCard(), {} as React.MouseEvent);
    expect(set.setCardMenu).not.toHaveBeenCalled();
  });

  it('prefills the P/T prompt with the card P/T', () => {
    const { result, lastPrompt } = setup(menuFor());
    result.current.handleRequestSetPT();
    expect(lastPrompt()).toMatchObject({ title: 'Set power/toughness', initialValue: '1/1' });
  });

  it('sends a 1-indexed library position as a 0-indexed x', () => {
    const { result, webClient, lastPrompt } = setup(menuFor());

    result.current.handleRequestMoveToLibraryAt();
    lastPrompt().onSubmit('3');

    expect(vi.mocked(webClient.request.game.moveCard).mock.calls[0][1]).toMatchObject({
      targetZone: ZoneName.DECK,
      x: 2,
    });
  });
});
