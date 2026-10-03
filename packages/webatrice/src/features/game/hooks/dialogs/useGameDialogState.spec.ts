import { act, renderHook } from '@testing-library/react';

import { DEFAULT_DIE_COUNT, DEFAULT_DIE_SIDES } from '../../dialogs/RollDieDialog/RollDieDialog';
import { useGameDialogState } from './useGameDialogState';

describe('useGameDialogState', () => {
  it('starts with every dialog and menu closed and the default die', () => {
    const { result } = renderHook(() => useGameDialogState());

    expect(result.current.state).toMatchObject({
      cardMenu: null,
      zoneMenu: null,
      playerMenu: null,
      handMenu: null,
      zoneViews: [],
      prompt: null,
      rollDieOpen: false,
      lastDieSides: DEFAULT_DIE_SIDES,
      lastDieCount: DEFAULT_DIE_COUNT,
      createTokenOpen: false,
      sideboardOpen: false,
      concedeConfirm: null,
      leaveConfirm: false,
      revealState: null,
    });
  });

  it('opens and closes each flag through its toggle', () => {
    const { result } = renderHook(() => useGameDialogState());

    act(() => result.current.toggles.openGameInfo());
    expect(result.current.state.gameInfoOpen).toBe(true);
    act(() => result.current.toggles.openUnconcede());
    expect(result.current.state.concedeConfirm).toBe('unconcede');
    act(() => result.current.toggles.closeConcedeConfirm());
    expect(result.current.state.concedeConfirm).toBeNull();
    act(() => result.current.toggles.closeGameInfo());
    expect(result.current.state.gameInfoOpen).toBe(false);
  });

  it('closeAllContextMenus closes all four menus', () => {
    const { result } = renderHook(() => useGameDialogState());
    act(() => {
      result.current.set.setZoneMenu({ playerId: 1, zoneName: 'grave', anchorPosition: { top: 0, left: 0 } });
      result.current.set.setPlayerMenu({ top: 0, left: 0 });
      result.current.set.setHandMenu({ top: 0, left: 0 });
    });

    act(() => result.current.closeAllContextMenus());

    expect(result.current.state).toMatchObject({ cardMenu: null, zoneMenu: null, playerMenu: null, handMenu: null });
  });

  it('keeps its setters and toggles stable while the state changes', () => {
    const { result } = renderHook(() => useGameDialogState());
    const { set, toggles, closeAllContextMenus, state } = result.current;

    act(() => toggles.openRollDie());

    expect(result.current.state).not.toBe(state);
    expect(result.current.set).toBe(set);
    expect(result.current.toggles).toBe(toggles);
    expect(result.current.closeAllContextMenus).toBe(closeAllContextMenus);
  });
});
