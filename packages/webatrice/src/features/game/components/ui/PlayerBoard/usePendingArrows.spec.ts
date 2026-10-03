import { act, fireEvent, renderHook } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';

import type { PlayerTargetCommands } from './playerBoard.types';
import { usePendingArrows } from './usePendingArrows';

function targetCommands(): PlayerTargetCommands {
  return { attach: vi.fn(), unattach: vi.fn(), createArrow: vi.fn(), clearOwnArrows: vi.fn() };
}

function addElement(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement('div');
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);
  return el;
}

function renderArrows() {
  const commands = targetCommands();
  const hook = renderHook(() => usePendingArrows({ playerId: 1, targetCommands: commands }));
  const startDrawArrow = () => act(() => {
    hook.result.current.setDrawArrowPending({ sourceCardId: 10, sourceCardName: 'Bolt', sourceZone: ZoneName.TABLE });
  });
  return { ...hook, commands, startDrawArrow };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('usePendingArrows', () => {
  it('draws the arrow to the next card clicked, on any seat', () => {
    const { result, commands, startDrawArrow } = renderArrows();
    const target = addElement({ 'data-card-id': '20', 'data-card-owner': '2', 'data-card-zone': ZoneName.TABLE });
    startDrawArrow();

    fireEvent.click(target);

    expect(commands.createArrow).toHaveBeenCalledExactlyOnceWith(10, ZoneName.TABLE, { kind: 'card', playerId: 2, cardId: 20 });
    expect(result.current.drawArrowPending).toBeNull();
  });

  it('draws the arrow to a player\'s life total', () => {
    const { commands, startDrawArrow } = renderArrows();
    const life = addElement({ 'data-arrow-target-kind': 'player', 'data-arrow-target-player-id': '2' });
    startDrawArrow();

    fireEvent.click(life);

    expect(commands.createArrow).toHaveBeenCalledExactlyOnceWith(10, ZoneName.TABLE, { kind: 'player', playerId: 2 });
  });

  it('cancels on the source card, on empty space, and on Escape, sending nothing', () => {
    const { result, commands, startDrawArrow } = renderArrows();
    const source = addElement({ 'data-card-id': '10', 'data-card-owner': '1', 'data-card-zone': ZoneName.TABLE });

    startDrawArrow();
    fireEvent.click(source);
    expect(result.current.drawArrowPending).toBeNull();

    startDrawArrow();
    fireEvent.click(document.body);
    expect(result.current.drawArrowPending).toBeNull();

    startDrawArrow();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(result.current.drawArrowPending).toBeNull();

    act(() => {
      result.current.setAttachPending({ sourceCardId: 10, sourceCardName: 'Bolt' });
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(result.current.attachPending).toBeNull();
    expect(commands.createArrow).not.toHaveBeenCalled();
  });

  it('follows the pointer only while a pick is pending, and mirrors the attach state into refs', () => {
    const { result, startDrawArrow } = renderArrows();
    fireEvent.mouseMove(window, { clientX: 5, clientY: 6 });
    expect(result.current.pendingArrowPointer).toBeNull();

    startDrawArrow();
    fireEvent.mouseMove(window, { clientX: 50, clientY: 60 });
    expect(result.current.pendingArrowPointer).toEqual({ x: 50, y: 60 });

    act(() => {
      result.current.setDrawArrowPending(null);
      result.current.setAttachPending({ sourceCardId: 10, sourceCardName: 'Bolt' });
      result.current.setAttachExtraSourceIds([11]);
    });
    expect(result.current.attachPendingRef.current).toEqual({ sourceCardId: 10, sourceCardName: 'Bolt' });
    expect(result.current.attachExtraSourceIdsRef.current).toEqual([11]);
  });
});
