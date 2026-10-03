import { act, renderHook } from '@testing-library/react';

import type { HydratedDeck } from '../types';
import { useDeckImagePreload } from './useDeckImagePreload';

const images: Array<{ src: string; onload: (() => void) | null; onerror: (() => void) | null }> = [];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    images.push(this);
  }
}

function deck(imageUris: Array<string | undefined>): HydratedDeck {
  return {
    name: 'D',
    meta: { v: 1, updatedAt: 'x' },
    format: 'modern',
    cards: imageUris.map((imageUri, i) => ({
      name: `C${i}`, quantity: 1, category: 'main', lookupSource: 'scryfall', imageUri,
    })),
  };
}

beforeEach(() => {
  images.length = 0;
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDeckImagePreload', () => {
  it('is ready at once for a deck without art', () => {
    const { result } = renderHook(() => useDeckImagePreload(1, deck([undefined]), false));
    expect(result.current).toEqual({ ready: true, loaded: 0, total: 0 });
  });

  it('waits for each distinct normalized preview URL, counting errors as done', () => {
    const d = deck([
      'https://cards.scryfall.io/small/front/a.jpg',
      'https://cards.scryfall.io/large/front/a.jpg',
      'https://cards.scryfall.io/small/front/b.jpg',
    ]);
    const { result } = renderHook(() => useDeckImagePreload(1, d, false));

    expect(images.map((i) => i.src)).toEqual([
      'https://cards.scryfall.io/normal/front/a.jpg',
      'https://cards.scryfall.io/normal/front/b.jpg',
    ]);
    expect(result.current).toEqual({ ready: false, loaded: 0, total: 2 });

    act(() => images[0].onload?.());
    expect(result.current).toEqual({ ready: false, loaded: 1, total: 2 });
    act(() => images[1].onerror?.());
    expect(result.current).toEqual({ ready: true, loaded: 2, total: 2 });
  });

  it('waits for the deck to finish loading and preloads once per deck', () => {
    const { result, rerender } = renderHook(
      ({ d, loading }) => useDeckImagePreload(1, d, loading),
      { initialProps: { d: null as HydratedDeck | null, loading: true } },
    );
    expect(result.current.ready).toBe(false);
    expect(images).toHaveLength(0);

    rerender({ d: deck(['https://example.com/a.png']), loading: false });
    act(() => images[0].onload?.());
    expect(result.current.ready).toBe(true);

    rerender({ d: deck(['https://example.com/a.png', 'https://example.com/b.png']), loading: false });
    expect(images).toHaveLength(1);
    expect(result.current.ready).toBe(true);
  });
});
