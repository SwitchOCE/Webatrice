import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';

import { WebClientContext } from '@cockatrice/datatrice/react';
import type { WebClient } from '@cockatrice/sockatrice';

import { clearDeckEditorCache, getCachedDeck, setCachedDeck } from '../deckEditorCache';
import { serializeDeckForSave, uploadDeckUpdate } from '../deckPersistence';
import type { HydratedDeck } from '../types';
import { AUTOSAVE_DEBOUNCE_MS, useDeckAutosave } from './useDeckAutosave';

vi.mock('../deckPersistence', () => ({
  serializeDeckForSave: vi.fn(),
  uploadDeckUpdate: vi.fn(),
}));

const deck: HydratedDeck = { name: 'D', meta: { v: 1, updatedAt: 'x' }, cards: [], format: 'modern' };
const client = {} as WebClient;

function wrapper({ children }: { children: ReactNode }) {
  return <WebClientContext value={client}>{children}</WebClientContext>;
}

function renderAutosave(initialSavedXml: string | null = null, current: HydratedDeck | null = deck) {
  // Stable, like the editor's `readDeck`: a new reader would re-create
  // the flush callback and flush on every render.
  const readDeck = () => current;
  return renderHook(() => useDeckAutosave(7, readDeck, initialSavedXml), { wrapper });
}

beforeEach(() => {
  vi.useFakeTimers();
  clearDeckEditorCache();
  vi.mocked(serializeDeckForSave).mockReturnValue('<new/>');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDeckAutosave', () => {
  it('debounces edits into one upload and reports saving, then saved on the ack', () => {
    const { result } = renderAutosave('<old/>');

    act(() => {
      result.current.scheduleSave();
      result.current.scheduleSave();
    });
    expect(result.current.saveState).toBe('dirty');
    expect(uploadDeckUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(uploadDeckUpdate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadDeckUpdate).mock.calls[0].slice(0, 3)).toEqual([client, 7, '<new/>']);
    expect(result.current.saveState).toBe('saving');

    act(() => vi.mocked(uploadDeckUpdate).mock.calls[0][3]!());
    expect(result.current.saveState).toBe('saved');
    expect(result.current.savedXml()).toBe('<new/>');
  });

  it('flags a failed upload and forgets its signature so the next save resends it', () => {
    setCachedDeck(7, { deck, savedXml: '<old/>' });
    const { result } = renderAutosave('<old/>');
    act(() => {
      result.current.scheduleSave();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(result.current.saveState).toBe('saving');

    act(() => vi.mocked(uploadDeckUpdate).mock.calls[0][4]!());
    expect(result.current.saveState).toBe('failed');
    expect(result.current.savedXml()).toBe('<old/>');
    expect(getCachedDeck(7)?.savedXml).toBe('<old/>');

    act(() => {
      result.current.scheduleSave();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(uploadDeckUpdate).toHaveBeenCalledTimes(2);
  });

  it('skips the upload when the XML matches the last save', () => {
    const { result } = renderAutosave('<new/>');
    act(() => {
      result.current.scheduleSave();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(uploadDeckUpdate).not.toHaveBeenCalled();
  });

  it('keeps the cached signature in step with each save', () => {
    setCachedDeck(7, { deck, savedXml: '<old/>' });
    const { result } = renderAutosave('<old/>');
    act(() => {
      result.current.scheduleSave();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(getCachedDeck(7)?.savedXml).toBe('<new/>');
  });

  it('flushes a pending save on demand and on unmount', () => {
    const { result, unmount } = renderAutosave('<old/>');
    act(() => result.current.scheduleSave());
    act(() => result.current.flushSave());
    expect(uploadDeckUpdate).toHaveBeenCalledTimes(1);

    vi.mocked(serializeDeckForSave).mockReturnValue('<newer/>');
    act(() => result.current.scheduleSave());
    unmount();
    expect(uploadDeckUpdate).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a deck', () => {
    const { result } = renderAutosave(null, null);
    act(() => {
      result.current.scheduleSave();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(uploadDeckUpdate).not.toHaveBeenCalled();
  });

  it('marks a freshly downloaded deck clean', () => {
    const { result } = renderAutosave();
    act(() => result.current.scheduleSave());
    act(() => result.current.markSaved('<downloaded/>'));
    expect(result.current.saveState).toBe('idle');
    expect(result.current.savedXml()).toBe('<downloaded/>');
    act(() => result.current.resetSaved());
    expect(result.current.savedXml()).toBeNull();
  });
});
