import { act, renderHook } from '@testing-library/react';

import { DRAW_ANIMATION_MS, useDrawFlights } from './useDrawFlights';

function elementAt(rect: DOMRect): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => rect;
  return el;
}

const LIBRARY = new DOMRect(0, 0, 100, 70);
const HAND = new DOMRect(300, 400, 200, 100);

function renderFlights(handRect = HAND) {
  const libraryRef = { current: elementAt(LIBRARY) };
  const handRef = { current: elementAt(handRect) };
  return renderHook(
    ({ drawSeq, lastDrawCount }) => useDrawFlights({ drawSeq, lastDrawCount, libraryRef, handRef }),
    { initialProps: { drawSeq: 3, lastDrawCount: 1 } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useDrawFlights', () => {
  it('takes the first beacon as the baseline and flies nothing', () => {
    const { result } = renderFlights();
    act(() => vi.runAllTimers());
    expect(result.current.flights).toEqual([]);
  });

  it('flies one card back per drawn card, staggered, landing on the hand and then clearing', () => {
    const { result, rerender } = renderFlights();
    rerender({ drawSeq: 4, lastDrawCount: 2 });

    act(() => vi.advanceTimersByTime(0));
    expect(result.current.flights).toEqual([{ id: 1, from: LIBRARY, to: HAND, landed: true }]);
    act(() => vi.advanceTimersByTime(90));
    expect(result.current.flights.map((f) => f.id)).toEqual([1, 2]);

    act(() => vi.advanceTimersByTime(DRAW_ANIMATION_MS + 50));
    expect(result.current.flights).toEqual([]);
  });

  it('ignores a beacon that did not tick and a draw with no zone to measure', () => {
    const { result, rerender } = renderFlights(new DOMRect(0, 0, 0, 0));
    rerender({ drawSeq: 3, lastDrawCount: 5 });
    rerender({ drawSeq: 4, lastDrawCount: 1 });
    act(() => vi.runAllTimers());
    expect(result.current.flights).toEqual([]);
  });
});
