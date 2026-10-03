import { act, waitFor } from '@testing-library/react';
import { server } from '@cockatrice/datatrice';
import type { WebClient } from '@cockatrice/sockatrice';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { emptyCod, stageDeckDocument } from '@app/services';

import { renderWithProviders, connectedState, createMockWebClient } from '../../__test-utils__';
import { clearDeckEditorCache, useDeckEditor, type UseDeckEditor } from './useDeckEditor';

// Covers how the editor settles when the server never answers (or rejects)
// its download and autosave commands; the happy path is exercised through
// DeckEditor in the integration suite.

vi.mock('../../services/cards/cardCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/cards/cardCatalog')>();
  const unknown = (name: string) => ({ found: false, source: 'unknown', name, printings: [] });
  return {
    ...actual,
    lookupCard: vi.fn(async (name: string) => unknown(name)),
    lookupCards: vi.fn(async (inputs: Array<string | { name: string }>) =>
      new Map(inputs.map((i) => {
        const name = typeof i === 'string' ? i : i.name;
        return [name, unknown(name)];
      }))),
  };
});

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

describe('useDeckEditor draft', () => {
  const GAME_DECK = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<cockatrice_deck version="1">',
    '<deckname>Burn</deckname>',
    '<zone name="main">',
    '<card number="4" name="Lightning Bolt" setShortName="M11" collectorNumber="149" uuid="bolt-uuid"/>',
    '</zone>',
    '<zone name="side">',
    '<card number="2" name="Smash to Smithereens" setShortName="SOM" collectorNumber="104" uuid="smash-uuid"/>',
    '</zone>',
    '</cockatrice_deck>',
  ].join('');

  function DraftProbe({ token }: { token: string }) {
    editor.current = useDeckEditor(null, token);
    return null;
  }

  function setupDraft(token: string) {
    const webClient = createMockWebClient() as WebClient & { protobuf: { sendSessionCommand: ReturnType<typeof vi.fn> } };
    (webClient as unknown as { protobuf: unknown }).protobuf = { sendSessionCommand: vi.fn() };
    const result = renderWithProviders(<DraftProbe token={token} />, { preloadedState: connectedState, webClient });
    return { ...result, webClient };
  }

  it('hydrates the staged deck with every printing field, downloading nothing', async () => {
    const { webClient } = setupDraft(stageDeckDocument(GAME_DECK));
    await waitFor(() => expect(editor.current!.loading).toBe(false));

    expect(editor.current!.deck!.name).toBe('Burn');
    expect(editor.current!.deck!.cards.map((c) => [c.name, c.category, c.quantity, c.set, c.collectorNumber, c.scryfallId]))
      .toEqual([
        ['Lightning Bolt', 'main', 4, 'M11', '149', 'bolt-uuid'],
        ['Smash to Smithereens', 'sideboard', 2, 'SOM', '104', 'smash-uuid'],
      ]);
    expect(webClient.request.session.deckDownload).not.toHaveBeenCalled();
  });

  it('stores the draft as a new deck on its first save, then moves to it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { webClient, store } = setupDraft(stageDeckDocument(GAME_DECK));
      await waitFor(() => expect(editor.current!.loading).toBe(false));
      expect(webClient.request.session.deckUpload).not.toHaveBeenCalled();

      act(() => editor.current!.setName('Burn v2'));
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(webClient.request.session.deckUpload).toHaveBeenCalledTimes(1);
      const [path, deckId, xml] = vi.mocked(webClient.request.session.deckUpload).mock.calls[0];
      expect([path, deckId]).toEqual(['', 0]);
      expect(xml).toContain('<deckname>Burn v2</deckname>');
      expect(xml).toContain('collectorNumber="149"');
      expect(editor.current!.saveState).toBe('saving');

      act(() => {
        store.dispatch(server.Actions.deckUpload({
          path: '',
          treeItem: { id: 42, name: 'Burn v2' } as Parameters<typeof server.Actions.deckUpload>[0]['treeItem'],
        }));
      });
      expect(editor.current!.saveState).toBe('saved');
    } finally {
      vi.useRealTimers();
    }
  });

  const uploaded = (id: number, name: string, path = '') => server.Actions.deckUpload({
    path,
    treeItem: { id, name } as Parameters<typeof server.Actions.deckUpload>[0]['treeItem'],
  });

  it('saves edits made during the first upload to the new deck once its id arrives', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { webClient, store } = setupDraft(stageDeckDocument(GAME_DECK));
      await waitFor(() => expect(editor.current!.loading).toBe(false));

      act(() => editor.current!.setName('Burn v2'));
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(webClient.request.session.deckUpload).toHaveBeenCalledTimes(1);

      // Edited while the upload is in flight: nothing more is sent yet.
      act(() => editor.current!.setName('Burn v3'));
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(webClient.request.session.deckUpload).toHaveBeenCalledTimes(1);
      expect(webClient.protobuf.sendSessionCommand).not.toHaveBeenCalled();

      // Another root upload (say, My Decks' "New deck") is not this draft's answer.
      act(() => {
        store.dispatch(uploaded(41, 'Something else'));
      });
      expect(webClient.protobuf.sendSessionCommand).not.toHaveBeenCalled();
      expect(editor.current!.saveState).not.toBe('saved');

      act(() => {
        store.dispatch(uploaded(42, 'Burn v2'));
      });
      expect(webClient.request.session.deckUpload).toHaveBeenCalledTimes(1);
      expect(webClient.protobuf.sendSessionCommand).toHaveBeenCalledTimes(1);
      const [, command] = webClient.protobuf.sendSessionCommand.mock.calls[0];
      expect(command.deckId).toBe(42);
      expect(command.deckList).toContain('<deckname>Burn v3</deckname>');
      expect(editor.current!.saveState).toBe('saving');
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves an edit still waiting on the autosave debounce to the new deck', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { webClient, store } = setupDraft(stageDeckDocument(GAME_DECK));
      await waitFor(() => expect(editor.current!.loading).toBe(false));

      act(() => editor.current!.setName('Burn v2'));
      act(() => {
        vi.advanceTimersByTime(600);
      });
      act(() => editor.current!.setName('Burn v3'));
      act(() => {
        store.dispatch(uploaded(42, 'Burn v2'));
      });
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(webClient.request.session.deckUpload).toHaveBeenCalledTimes(1);
      expect(webClient.protobuf.sendSessionCommand).toHaveBeenCalledTimes(1);
      expect(webClient.protobuf.sendSessionCommand.mock.calls[0][1].deckId).toBe(42);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is not found for an unknown token', async () => {
    setupDraft('missing');
    await waitFor(() => expect(editor.current!.loading).toBe(false));
    expect(editor.current!.notFound).toBe(true);
  });
});
