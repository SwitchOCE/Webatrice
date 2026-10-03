import { act, renderHook, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  loadCardDataPreferences: hoisted.load,
}));

import type { CardDataPreferences } from '@app/services';
import {
  cardDataPreferencesStore,
  currentCardDataPreferences,
  refreshCardDataPreferences,
  useCardImageUrls,
  useImageCandidates,
} from './useCardDataPreferences';

const makePreferences = (templates: string[]): CardDataPreferences => ({
  setPreferences: new Map([['M10', { code: 'M10', sortKey: 0, enabled: true, isKnown: true }]]),
  setLongNames: new Map(),
  pictureUrlTemplates: templates,
});

describe('useCardDataPreferences', () => {
  beforeEach(() => {
    cardDataPreferencesStore.reset();
  });

  it('currentCardDataPreferences returns the latest value after a refresh, not the first load', async () => {
    hoisted.load.mockResolvedValueOnce(makePreferences(['https://a/!name!']));
    expect((await currentCardDataPreferences()).pictureUrlTemplates).toEqual(['https://a/!name!']);

    hoisted.load.mockResolvedValueOnce(makePreferences(['https://b/!name!']));
    await refreshCardDataPreferences();
    expect((await currentCardDataPreferences()).pictureUrlTemplates).toEqual(['https://b/!name!']);
  });

  it('useCardImageUrls is empty while loading, then resolves against the stored templates', async () => {
    hoisted.load.mockResolvedValueOnce(makePreferences(['https://img/!setcode!/!name!.jpg']));
    const card = { name: { value: 'Bolt' }, set: { value: 'M10' } };

    const { result } = renderHook(() => useCardImageUrls(card));
    expect(result.current).toEqual([]);

    await waitFor(() => expect(result.current[0]).toBe('https://img/M10/Bolt.jpg'));
    expect(result.current[result.current.length - 1]).toContain('api.scryfall.com/cards/named?exact=Bolt');
  });

  it('useCardImageUrls returns nothing for a missing card', async () => {
    hoisted.load.mockResolvedValueOnce(makePreferences([]));
    const { result } = renderHook(() => useCardImageUrls(undefined));
    await act(async () => {
      await cardDataPreferencesStore.whenReady();
    });
    expect(result.current).toEqual([]);
  });
});

describe('useImageCandidates', () => {
  it('advances through the list on each error and ends at null', () => {
    const urls = ['a', 'b'];
    const { result } = renderHook(() => useImageCandidates(urls));
    expect(result.current.src).toBe('a');

    act(() => result.current.onError());
    expect(result.current.src).toBe('b');

    act(() => result.current.onError());
    expect(result.current.src).toBeNull();
  });

  it('starts over when the candidate list changes', () => {
    const { result, rerender } = renderHook(({ urls }) => useImageCandidates(urls), {
      initialProps: { urls: ['a', 'b'] },
    });
    act(() => result.current.onError());
    expect(result.current.src).toBe('b');

    rerender({ urls: ['c', 'd'] });
    expect(result.current.src).toBe('c');
  });
});
