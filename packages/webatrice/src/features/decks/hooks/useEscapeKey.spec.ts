import { fireEvent, renderHook } from '@testing-library/react';

import { useEscapeKey } from './useEscapeKey';

describe('useEscapeKey', () => {
  it('calls the handler for Escape only while active', () => {
    const onEscape = vi.fn();
    const { rerender, unmount } = renderHook(({ active }) => useEscapeKey(active, onEscape), {
      initialProps: { active: true },
    });

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('can listen on window', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape, window));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
