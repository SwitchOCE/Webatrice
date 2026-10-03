import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';

import { isSelectKey, navigationTarget, useRovingOptions } from './listKeyboard';

const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as KeyboardEvent<HTMLElement>;

describe('navigationTarget', () => {
  it('moves one row with the arrows and stops at the ends', () => {
    expect(navigationTarget('ArrowDown', 1, 3)).toBe(2);
    expect(navigationTarget('ArrowDown', 2, 3)).toBe(2);
    expect(navigationTarget('ArrowUp', 1, 3)).toBe(0);
    expect(navigationTarget('ArrowUp', 0, 3)).toBe(0);
  });

  it('jumps with Home, End and the page keys', () => {
    expect(navigationTarget('Home', 7, 30)).toBe(0);
    expect(navigationTarget('End', 7, 30)).toBe(29);
    expect(navigationTarget('PageDown', 7, 30)).toBe(17);
    expect(navigationTarget('PageDown', 25, 30)).toBe(29);
    expect(navigationTarget('PageUp', 7, 30)).toBe(0);
  });

  it('starts at the first row when none is current, and ignores other keys', () => {
    expect(navigationTarget('ArrowDown', null, 3)).toBe(0);
    expect(navigationTarget('ArrowUp', null, 3)).toBe(0);
    expect(navigationTarget('a', 1, 3)).toBeNull();
    expect(navigationTarget('ArrowDown', null, 0)).toBeNull();
  });

  it('treats Space and Enter as select', () => {
    expect(isSelectKey(' ')).toBe(true);
    expect(isSelectKey('Enter')).toBe(true);
    expect(isSelectKey('Tab')).toBe(false);
  });
});

describe('useRovingOptions', () => {
  it('keeps one option in the tab order, the selected one', () => {
    const { result } = renderHook(() => useRovingOptions(3, 1, vi.fn()));
    expect([0, 1, 2].map((i) => result.current.optionProps(i).tabIndex)).toEqual([-1, 0, -1]);
  });

  it('moves focus with the arrows and selects with Space or Enter', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useRovingOptions(3, null, onSelect));
    const elements = [0, 1, 2].map(() => ({ focus: vi.fn() }) as unknown as HTMLElement);
    elements.forEach((element, i) => result.current.optionProps(i).ref(element));

    result.current.optionProps(0).onKeyDown(key('ArrowDown'));
    expect(elements[1].focus).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();

    act(() => result.current.optionProps(1).onFocus());
    expect(result.current.optionProps(1).tabIndex).toBe(0);
    result.current.optionProps(1).onKeyDown(key(' '));
    result.current.optionProps(2).onKeyDown(key('Enter'));
    expect(onSelect.mock.calls).toEqual([[1], [2]]);
  });
});
