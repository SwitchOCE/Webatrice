import { act, renderHook } from '@testing-library/react';

import { useMessageMacros } from './useMessageMacros';

afterEach(() => {
  window.localStorage.removeItem('webatrice.messageMacros');
});

describe('useMessageMacros', () => {
  it('is empty without stored macros or with a malformed list', () => {
    expect(renderHook(() => useMessageMacros()).result.current).toEqual([]);
    window.localStorage.setItem('webatrice.messageMacros', '{nope');
    expect(renderHook(() => useMessageMacros()).result.current).toEqual([]);
  });

  it('reads the stored macros in order, skipping blanks, and follows other tabs', () => {
    window.localStorage.setItem('webatrice.messageMacros', JSON.stringify(['gg', '', 'Respond?', 3]));
    const { result } = renderHook(() => useMessageMacros());
    expect(result.current).toEqual(['gg', 'Respond?']);

    window.localStorage.setItem('webatrice.messageMacros', JSON.stringify(['ok']));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'webatrice.messageMacros' }));
    });
    expect(result.current).toEqual(['ok']);
  });
});
