import { act, renderHook, waitFor } from '@testing-library/react';
import { combineReducers } from '@reduxjs/toolkit';

import { server } from '@cockatrice/datatrice';

import { rootReducerMap, type RootState } from '../../store';
import { connectedState, createMockWebClient } from '../../__test-utils__';
import { makeReduxWebClientHookWrapper } from '../../__test-utils__/makeHookWrapper';

vi.mock('@app/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/services')>();
  return { ...actual, lookupCards: vi.fn(async () => new Map()), trackEvent: vi.fn() };
});

import { emptyCod } from '@app/services';
import { clearDeckEditorCache } from './deckEditorCache';
import { useDeckEditor } from './useDeckEditor';

const reducer = combineReducers(rootReducerMap);
const DECK_A = 1;
const DECK_B = 2;

function setup(initialDeckId: number) {
  const webClient = createMockWebClient();
  const sendSessionCommand = vi.fn();
  (webClient as any).protobuf = { sendSessionCommand };
  const { Wrapper, store } = makeReduxWebClientHookWrapper({
    reducer: reducer as never,
    preloadedState: connectedState as Partial<RootState> as never,
    webClient,
  });
  const hook = renderHook(({ deckId }) => useDeckEditor(deckId), {
    wrapper: Wrapper,
    initialProps: { deckId: initialDeckId },
  });
  const download = async (deckId: number, name: string, format: string) => {
    act(() => {
      store.dispatch(server.Actions.deckDownloaded({ deckId, deck: emptyCod(name, format) }));
    });
    await waitFor(() => expect(hook.result.current.deck?.name).toBe(name));
  };
  const uploads = () =>
    sendSessionCommand.mock.calls.map(([, cmd]) => ({ deckId: cmd.deckId, deckList: cmd.deckList as string }));
  return { ...hook, Wrapper, download, uploads };
}

beforeEach(() => {
  clearDeckEditorCache();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useDeckEditor — switching deckId on a mounted editor', () => {
  it('re-seeds from the cache and autosaves the open deck, not the previous one', async () => {
    const { result, rerender, download, uploads } = setup(DECK_A);
    await download(DECK_A, 'Alpha', 'modern');

    rerender({ deckId: DECK_B });
    await download(DECK_B, 'Bravo', 'standard');

    // A is cached now: switching back must show A without a download.
    rerender({ deckId: DECK_A });
    expect(result.current.deck?.name).toBe('Alpha');
    expect(result.current.deck?.format).toBe('modern');

    act(() => result.current.setDescription('edited'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(uploads()).toHaveLength(1);
    expect(uploads()[0].deckId).toBe(DECK_A);
    expect(uploads()[0].deckList).toContain('<deckname>Alpha</deckname>');
    expect(uploads()[0].deckList).toContain('modern');
    expect(uploads()[0].deckList).not.toContain('standard');
  });

  it('does not mirror the previous deck into the next deck\'s cache entry', async () => {
    const { rerender, unmount, Wrapper, download } = setup(DECK_A);
    await download(DECK_A, 'Alpha', 'modern');
    rerender({ deckId: DECK_B });
    await download(DECK_B, 'Bravo', 'standard');
    rerender({ deckId: DECK_A });
    unmount();

    const { result } = renderHook(() => useDeckEditor(DECK_A), { wrapper: Wrapper });

    expect(result.current.deck?.name).toBe('Alpha');
    expect(result.current.deck?.format).toBe('modern');
  });

  it('clears the previous deck while an uncached deck downloads', async () => {
    const { result, rerender, download } = setup(DECK_A);
    await download(DECK_A, 'Alpha', 'modern');

    rerender({ deckId: DECK_B });

    expect(result.current.deck).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('flushes a pending edit to the deck it was made on when the deckId changes', async () => {
    const { result, rerender, download, uploads } = setup(DECK_A);
    await download(DECK_A, 'Alpha', 'modern');
    rerender({ deckId: DECK_B });
    await download(DECK_B, 'Bravo', 'standard');
    rerender({ deckId: DECK_A });

    act(() => result.current.setDescription('edited'));
    rerender({ deckId: DECK_B });

    expect(uploads()).toHaveLength(1);
    expect(uploads()[0].deckId).toBe(DECK_A);
    expect(uploads()[0].deckList).toContain('<deckname>Alpha</deckname>');
  });
});
