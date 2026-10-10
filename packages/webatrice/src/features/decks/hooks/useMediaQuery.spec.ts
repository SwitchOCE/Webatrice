import { act, renderHook } from '@testing-library/react';

import { useMediaQuery } from './useMediaQuery';

describe('useMediaQuery', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  let listeners: Array<() => void>;
  let matches: boolean;

  beforeEach(() => {
    listeners = [];
    matches = true;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        media: query,
        get matches() {
          return matches;
        },
        addEventListener: (_: string, fn: () => void) => listeners.push(fn),
        removeEventListener: (_: string, fn: () => void) => {
          listeners = listeners.filter((l) => l !== fn);
        },
      }),
    });
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(window, 'matchMedia', original);
    } else {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('reports the current match and follows changes', () => {
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 1340px)'));
    expect(result.current).toBe(true);
    matches = false;
    act(() => listeners.forEach((fn) => fn()));
    expect(result.current).toBe(false);
    unmount();
    expect(listeners).toHaveLength(0);
  });

  it('is false where matchMedia does not exist', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    const { result } = renderHook(() => useMediaQuery('(min-width: 1340px)'));
    expect(result.current).toBe(false);
  });
});
