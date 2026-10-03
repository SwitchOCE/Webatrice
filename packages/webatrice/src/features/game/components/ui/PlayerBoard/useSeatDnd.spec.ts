import { act, renderHook } from '@testing-library/react';
import type React from 'react';

import type { SeatDropPoint } from '../../../hooks/seatDropPlan';
import type { PlayerCardViewModel, PlayerTargetCommands } from './playerBoard.types';
import { useSeatDnd, type UseSeatDndArgs } from './useSeatDnd';

// The game's DnD coordinator is replaced by spies: each drag source records how
// the seat starts it, and each drop zone hands over its resolver.
const dnd = vi.hoisted(() => ({
  starts: new Map<string, ReturnType<typeof vi.fn>>(),
  zones: new Map<string, { resolve: (drop: SeatDropPoint, source: unknown) => unknown }>(),
  canAct: true,
}));

vi.mock('../SeatDragContext', () => ({
  useActiveSeatDrag: () => null,
  useSeatDragSource: (id: string) => {
    if (!dnd.starts.has(id)) {
      dnd.starts.set(id, vi.fn());
    }
    return dnd.starts.get(id);
  },
  useSeatDropZone: (id: string, zone: { resolve: (drop: SeatDropPoint, source: unknown) => unknown }) => {
    dnd.zones.set(id, zone);
    return () => undefined;
  },
}));

vi.mock('../CardVisualStateContext', () => ({
  useCanActFor: () => () => dnd.canAct,
}));

const card = (id: number): PlayerCardViewModel => ({ id: String(id), name: `Card ${id}`, scryfallId: '' });
const press = {} as React.PointerEvent<HTMLElement>;
const release = (init: Partial<PointerEvent> = {}) => init as PointerEvent;

function element(rect: DOMRect): HTMLDivElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => rect;
  return el;
}

function setup(args: Partial<UseSeatDndArgs> = {}) {
  const box = element(new DOMRect(0, 0, 1000, 800));
  [100, 200, 300].forEach((left, i) => {
    const handCard = element(new DOMRect(left, 600, 80, 110));
    handCard.setAttribute('data-card', '');
    handCard.setAttribute('data-zone', 'hand');
    handCard.setAttribute('data-card-id', String(30 + i));
    box.append(handCard);
  });
  const targetCommands = { attach: vi.fn() } as unknown as PlayerTargetCommands;
  const props: UseSeatDndArgs = {
    seatId: 1,
    playerId: 1,
    seatDrag: null,
    selection: null,
    setSelection: vi.fn(),
    attachPendingRef: { current: null },
    attachExtraSourceIdsRef: { current: [] },
    setAttachPending: vi.fn(),
    setAttachExtraSourceIds: vi.fn(),
    targetCommands,
    stackDisplayList: [card(50), card(51)],
    boxRef: { current: box },
    handRef: { current: null },
    stackRef: { current: element(new DOMRect(0, 0, 100, 400)) },
    libraryRef: { current: null },
    graveyardRef: { current: null },
    exileRef: { current: null },
    CARD_W_PX: 72,
    CARD_H_PX: 102,
    STACK_HOFFSET_PX: 8,
    ...args,
  };
  const { result } = renderHook(() => useSeatDnd(props));
  return { result, props, targetCommands };
}

beforeEach(() => {
  dnd.starts.clear();
  dnd.zones.clear();
  dnd.canAct = true;
});

describe('useSeatDnd', () => {
  it('drags the pressed card alone, and a press released in place selects it', () => {
    const { result, props } = setup();
    result.current.startSeatCardDrag(press, card(10), 'battlefield', [card(10), card(11)]);

    const start = dnd.starts.get('seat-1-battlefield')!;
    expect(start).toHaveBeenCalledWith(press, [card(10)], expect.any(Function));
    act(() => start.mock.calls[0][2](release()));
    expect(props.setSelection).toHaveBeenCalledWith({ zone: 'battlefield', ids: new Set(['10']) });
  });

  it('drags the whole selection when the pressed card is in it, with no click for a group', () => {
    const { result } = setup({ selection: { zone: 'hand', ids: new Set(['30', '32']) } });
    result.current.startSeatCardDrag(press, card(30), 'hand', [card(30), card(31), card(32)]);
    expect(dnd.starts.get('seat-1-hand')).toHaveBeenCalledWith(press, [card(30), card(32)], undefined);
  });

  it('toggles a card in the selection on Ctrl / Cmd click, and clears it when the last one goes', () => {
    const { result, props } = setup({ selection: { zone: 'stack', ids: new Set(['50']) } });
    result.current.startSeatCardDrag(press, card(51), 'stack', [card(50), card(51)]);
    const onRelease = dnd.starts.get('seat-1-stack')!.mock.calls[0][2];
    act(() => onRelease(release({ metaKey: true })));
    expect(props.setSelection).toHaveBeenLastCalledWith({ zone: 'stack', ids: new Set(['50', '51']) });

    result.current.startSeatCardDrag(press, card(50), 'stack', [card(50), card(51)]);
    act(() => dnd.starts.get('seat-1-stack')!.mock.calls[1][2](release({ ctrlKey: true })));
    expect(props.setSelection).toHaveBeenLastCalledWith(null);
  });

  it('resolves a pending attach on the next battlefield click, from every source', () => {
    const { result, props, targetCommands } = setup({
      attachPendingRef: { current: { sourceCardId: 10, sourceCardName: 'Aura' } },
      attachExtraSourceIdsRef: { current: [11] },
    });
    result.current.startSeatCardDrag(press, card(20), 'battlefield', [card(20)]);
    act(() => dnd.starts.get('seat-1-battlefield')!.mock.calls[0][2](release()));
    expect(vi.mocked(targetCommands.attach).mock.calls).toEqual([
      [10, { playerId: 1, cardId: 20 }],
      [11, { playerId: 1, cardId: 20 }],
    ]);
    expect(props.setAttachPending).toHaveBeenCalledWith(null);
    expect(props.setSelection).not.toHaveBeenCalled();
  });

  it('drags the top card of a pile', () => {
    const { result } = setup();
    result.current.startPileDrag(press, card(41), 'graveyard');
    expect(dnd.starts.get('seat-1-graveyard')).toHaveBeenCalledWith(press, [card(41)]);
  });

  it('resolves a hand drop to the cards left of the pointer, not counting the dragged ones', () => {
    setup();
    const hand = dnd.zones.get('seat-1-hand')!;
    const drop = (x: number) => ({ pointer: { x, y: 650 }, cardOrigin: { x, y: 650 } });
    expect(hand.resolve(drop(250), { zone: 'battlefield', cards: [] })).toEqual({ zone: 'hand', index: 2 });
    expect(hand.resolve(drop(250), { zone: 'hand', cards: [card(30)] })).toEqual({ zone: 'hand', index: 1 });
  });

  it('resolves pile drops to their zone', () => {
    setup();
    for (const zone of ['library', 'graveyard', 'exile'] as const) {
      expect(dnd.zones.get(`seat-1-${zone}`)!.resolve({ pointer: { x: 0, y: 0 }, cardOrigin: { x: 0, y: 0 } }, {}))
        .toEqual({ zone });
    }
  });
});
