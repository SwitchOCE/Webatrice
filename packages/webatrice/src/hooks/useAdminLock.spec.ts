import { act, renderHook } from '@testing-library/react';

import { setAdminLocked, useAdminLock, useAdminLocked } from './useAdminLock';

afterEach(() => {
  setAdminLocked(true);
});

describe('useAdminLock', () => {
  it('starts locked until a deliberate unlock', () => {
    const { result } = renderHook(() => useAdminLocked());
    expect(result.current).toBe(true);
  });

  it('shares one lock between the Administration page and every reader', () => {
    const page = renderHook(() => useAdminLock());
    const menu = renderHook(() => useAdminLocked());

    act(() => page.result.current[1](true));
    expect(page.result.current[0]).toBe(true);
    expect(menu.result.current).toBe(true);

    act(() => page.result.current[1](false));
    expect(menu.result.current).toBe(false);
  });
});
