import { act, renderHook } from '@testing-library/react';

import { makeCardKey } from '../utils/CardRegistry/CardRegistryContext';
import { useGameSelection } from './useGameSelection';

describe('useGameSelection', () => {
  it('holds the selection as card keys, and clearSelection empties it', () => {
    const { result } = renderHook(() => useGameSelection());

    act(() => {
      result.current.setSelectedCardKeys(new Set([makeCardKey(1, 'table', 5)]));
    });
    expect([...result.current.selectedCardKeys]).toEqual([makeCardKey(1, 'table', 5)]);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedCardKeys.size).toBe(0);
  });
});
