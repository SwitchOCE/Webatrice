import { act, renderHook } from '@testing-library/react';
import { makeCard } from '@cockatrice/datatrice/testing';

import { makeCardKey } from '../utils/CardRegistry/CardRegistryContext';
import { useGameSelection } from './useGameSelection';

describe('useGameSelection', () => {
  describe('collapseUnlessSelected', () => {
    it('replaces the selection with just this card when it is not selected', () => {
      const { result } = renderHook(() => useGameSelection());

      act(() => {
        result.current.collapseUnlessSelected(1, 'table', makeCard({ id: 5 }));
      });

      expect([...result.current.selectedCardKeys]).toEqual([makeCardKey(1, 'table', 5)]);
    });

    it('preserves the selection when the card is already selected', () => {
      const { result } = renderHook(() => useGameSelection());
      const multi = new Set([makeCardKey(1, 'table', 5), makeCardKey(1, 'table', 6)]);

      act(() => {
        result.current.setSelectedCardKeys(multi);
      });
      act(() => {
        result.current.collapseUnlessSelected(1, 'table', makeCard({ id: 6 }));
      });

      expect([...result.current.selectedCardKeys].sort()).toEqual([...multi].sort());
    });

    it('no-ops when owner or zone is missing', () => {
      const { result } = renderHook(() => useGameSelection());
      act(() => {
        result.current.collapseUnlessSelected(undefined, 'table', makeCard({ id: 5 }));
      });
      expect(result.current.selectedCardKeys.size).toBe(0);
    });
  });

  it('clearSelection empties the selection', () => {
    const { result } = renderHook(() => useGameSelection());

    act(() => {
      result.current.collapseUnlessSelected(1, 'table', makeCard({ id: 5 }));
    });
    expect(result.current.selectedCardKeys.size).toBe(1);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedCardKeys.size).toBe(0);
  });
});
