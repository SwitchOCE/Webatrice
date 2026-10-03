import { act, waitFor } from '@testing-library/react';
import { server } from '@cockatrice/datatrice';
import type { WebClient } from '@cockatrice/sockatrice';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';

import { renderWithProviders, connectedState, createMockWebClient } from '../../__test-utils__';
import { emptyCod } from './cod';
import { clearDeckEditorCache, useDeckEditor, type UseDeckEditor } from './useDeckEditor';

// Covers how the editor settles when the server never answers (or rejects)
// its download and autosave commands; the happy path is exercised through
// DeckEditor in the integration suite.

const editor: { current: UseDeckEditor | null } = { current: null };

function Probe({ deckId }: { deckId: number }) {
  editor.current = useDeckEditor(deckId);
  return null;
}

function setup(deckId = 5) {
  const webClient = createMockWebClient() as WebClient & { protobuf: { sendSessionCommand: ReturnType<typeof vi.fn> } };
  (webClient as unknown as { protobuf: unknown }).protobuf = { sendSessionCommand: vi.fn() };
  const result = renderWithProviders(<Probe deckId={deckId} />, { preloadedState: connectedState, webClient });
  return { ...result, webClient };
}

beforeEach(() => {
  clearDeckEditorCache();
  editor.current = null;
});

describe('useDeckEditor download failure', () => {
  it('stops loading and explains a timed-out download', () => {
    const { store } = setup(5);
    expect(editor.current!.loading).toBe(true);

    act(() => {
      store.dispatch(server.Actions.deckDownloadFailed({
        deckId: 5,
        responseCode: Response_ResponseCode.RespNotConnected,
        failure: WebsocketTypes.CommandFailure.Timeout,
      }));
    });

    expect(editor.current!.loading).toBe(false);
    expect(editor.current!.notFound).toBe(true);
    expect(editor.current!.loadError).toBe('CommandFailure.timeout');
  });

  it('uses the generic download message for a server rejection', () => {
    const { store } = setup(5);
    act(() => {
      store.dispatch(server.Actions.deckDownloadFailed({ deckId: 5, responseCode: Response_ResponseCode.RespNameNotFound }));
    });
    expect(editor.current!.loadError).toBe('DeckEditor.downloadFailed');
  });

  it('ignores a failure for a different deck', () => {
    const { store } = setup(5);
    act(() => {
      store.dispatch(server.Actions.deckDownloadFailed({ deckId: 6, responseCode: Response_ResponseCode.RespNameNotFound }));
    });
    expect(editor.current!.loading).toBe(true);
    expect(editor.current!.loadError).toBeNull();
  });
});

describe('useDeckEditor autosave failure', () => {
  async function loadDeck() {
    const ctx = setup(5);
    act(() => {
      ctx.store.dispatch(server.Actions.deckDownloaded({ deckId: 5, deck: emptyCod('Test', 'commander') }));
    });
    await waitFor(() => expect(editor.current!.loading).toBe(false));
    return ctx;
  }

  function lastUploadOptions(webClient: { protobuf: { sendSessionCommand: ReturnType<typeof vi.fn> } }) {
    const calls = webClient.protobuf.sendSessionCommand.mock.calls;
    return calls[calls.length - 1][2] as { onSuccess: () => void; onError: (...args: unknown[]) => void };
  }

  it('flags the save as failed when the upload errors, and resends the same content on the next save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { webClient } = await loadDeck();
      webClient.protobuf.sendSessionCommand.mockClear();

      act(() => editor.current!.setName('Renamed'));
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(editor.current!.saveState).toBe('saving');
      expect(webClient.protobuf.sendSessionCommand).toHaveBeenCalledTimes(1);

      act(() => lastUploadOptions(webClient).onError(
        Response_ResponseCode.RespNotConnected, {}, WebsocketTypes.CommandFailure.Timeout,
      ));
      expect(editor.current!.saveState).toBe('failed');

      // The failed content is no longer considered saved, so a flush sends it again.
      act(() => editor.current!.setName('Renamed'));
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(webClient.protobuf.sendSessionCommand).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
