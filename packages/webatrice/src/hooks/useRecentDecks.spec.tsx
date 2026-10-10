import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';

import { makeUser } from '@cockatrice/datatrice/testing';
import { recordRecentDeck, recentDeckSnapshot, resetRecentDecksCache, type RecentDeckSource } from '@app/services';

import { useRecentDecks, useRecordRecentDeck } from './useRecentDecks';

const deck = (name: string): RecentDeckSource => ({ name, format: 'modern', meta: {}, cards: [] });

function wrapperFor(userName: string | null) {
  const store = configureStore({
    reducer: { server: (state = { user: userName ? makeUser({ name: userName }) : null }) => state },
  });
  return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
}

beforeEach(() => {
  window.localStorage.clear();
  resetRecentDecksCache();
});

describe('useRecentDecks', () => {
  it('shows only the signed-in account’s decks', () => {
    recordRecentDeck(recentDeckSnapshot('bob', 1, deck('Bob deck'), 1));
    recordRecentDeck(recentDeckSnapshot('alice', 2, deck('Alice deck'), 2));
    const { result } = renderHook(() => useRecentDecks(), { wrapper: wrapperFor('alice') });
    expect(result.current.map((d) => d.name)).toEqual(['Alice deck']);
  });

  it('is empty when signed out', () => {
    recordRecentDeck(recentDeckSnapshot('alice', 2, deck('Alice deck'), 2));
    const { result } = renderHook(() => useRecentDecks(), { wrapper: wrapperFor(null) });
    expect(result.current).toEqual([]);
  });
});

describe('useRecordRecentDeck', () => {
  it('records the open deck and follows renames', () => {
    const wrapper = wrapperFor('alice');
    const list = renderHook(() => useRecentDecks(), { wrapper });
    const { rerender } = renderHook(({ d }) => useRecordRecentDeck(5, d), { wrapper, initialProps: { d: deck('First') } });
    expect(list.result.current.map((d) => [d.deckId, d.name])).toEqual([[5, 'First']]);
    act(() => rerender({ d: deck('Renamed') }));
    expect(list.result.current.map((d) => [d.deckId, d.name])).toEqual([[5, 'Renamed']]);
  });

  it('ignores drafts and decks still loading', () => {
    const wrapper = wrapperFor('alice');
    renderHook(() => useRecordRecentDeck(null, deck('Draft')), { wrapper });
    renderHook(() => useRecordRecentDeck(6, null), { wrapper });
    const list = renderHook(() => useRecentDecks(), { wrapper });
    expect(list.result.current).toEqual([]);
  });
});
