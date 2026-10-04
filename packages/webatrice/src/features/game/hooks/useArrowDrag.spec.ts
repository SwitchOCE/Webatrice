import { createRef } from 'react';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { ZoneName } from '@cockatrice/sockatrice';
import { ArrowColor } from '@app/types';

import { createCardRegistry } from '../utils/CardRegistry/CardRegistryContext';
import { arrowCardAt, arrowTargetAt, useArrowDrag } from './useArrowDrag';

const added: HTMLElement[] = [];

function addElement(attrs: Record<string, string>, parent: HTMLElement = document.body): HTMLElement {
  const el = document.createElement('div');
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  parent.appendChild(el);
  added.push(el);
  return el;
}

const cardElement = (playerId: number, zone: string, cardId: number) =>
  addElement({ 'data-card-id': String(cardId), 'data-card-owner': String(playerId), 'data-card-zone': zone });

afterEach(() => {
  added.splice(0).forEach((el) => el.remove());
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

describe('arrow hit-testing', () => {
  it('reads a card from the closest element carrying its owner, zone and id', () => {
    const card = cardElement(2, ZoneName.STACK, 21);
    const inner = addElement({}, card);
    expect(arrowCardAt(inner)).toEqual({ playerId: 2, zone: ZoneName.STACK, cardId: 21 });
    expect(arrowTargetAt(inner)).toEqual({ kind: 'card', playerId: 2, zone: ZoneName.STACK, cardId: 21 });
  });

  it('falls back to a player\'s life total, and to nothing', () => {
    const life = addElement({ 'data-arrow-target-kind': 'player', 'data-arrow-target-player-id': '3' });
    // A hand card carries only its id: it is no arrow target.
    const handCard = addElement({ 'data-card-id': '30' }, life);
    expect(arrowTargetAt(handCard)).toEqual({ kind: 'player', playerId: 3 });
    expect(arrowTargetAt(document.body)).toBeNull();
    expect(arrowTargetAt(null)).toBeNull();
    expect(arrowCardAt(life)).toBeNull();
  });
});

const mouseDown = (button: number, target: Element) =>
  ({ button, target, clientX: 10, clientY: 10 }) as unknown as React.MouseEvent<HTMLDivElement>;

describe('useArrowDrag', () => {
  function setup() {
    const onDrop = vi.fn();
    const containerRef = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useArrowDrag({ containerRef, cardRegistry: createCardRegistry(), onDrop }));
    return { result, onDrop };
  }

  function press(source: HTMLElement, result: ReturnType<typeof setup>['result']) {
    act(() => {
      result.current.handleBoardMouseDown(mouseDown(2, source));
    });
  }

  it('hands a drag released over a target to onDrop, coloured by the modifier held at release', () => {
    const { result, onDrop } = setup();
    const source = cardElement(1, ZoneName.TABLE, 10);
    const target = cardElement(2, ZoneName.TABLE, 20);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });

    press(source, result);
    expect(result.current.sourceKey).not.toBeNull();
    fireEvent.mouseMove(window, { clientX: 40, clientY: 40 });
    expect(result.current.targetKey).not.toBeNull();
    fireEvent.mouseUp(window, { button: 2, clientX: 40, clientY: 40, altKey: true });

    expect(onDrop).toHaveBeenCalledExactlyOnceWith(
      { playerId: 1, zone: ZoneName.TABLE, cardId: 10 },
      { kind: 'card', playerId: 2, zone: ZoneName.TABLE, cardId: 20 },
      ArrowColor.BLUE,
    );
    expect(result.current.sourceKey).toBeNull();
    // The release's own context menu is swallowed.
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    window.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it('leaves a press that never moves to the context menu', () => {
    const { result, onDrop } = setup();
    const source = cardElement(1, ZoneName.TABLE, 10);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => source });

    press(source, result);
    fireEvent.mouseUp(window, { button: 2, clientX: 11, clientY: 11 });

    expect(onDrop).not.toHaveBeenCalled();
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    window.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
  });

  it('ignores a left press, a press off any card, and is cancelled by Escape', () => {
    const { result, onDrop } = setup();
    act(() => {
      result.current.handleBoardMouseDown(mouseDown(0, cardElement(1, ZoneName.TABLE, 10)));
    });
    press(document.body, result);
    expect(result.current.sourceKey).toBeNull();

    press(cardElement(1, ZoneName.TABLE, 11), result);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(result.current.sourceKey).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
  });
});
