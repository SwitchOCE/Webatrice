import { act, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { stageDeckDocument } from '@app/services';

import { connectedState, createMockWebClient, renderWithProviders } from '../../../__test-utils__';
import { clearDeckEditorCache, getCachedDeck } from '../deckEditorCache';
import { useDeckEditor, type UseDeckEditor } from './useDeckEditor';

// An unsaved draft handed over by token (the game's "Open deck in deck
// editor"), hydrated for real so every printing field is checked.

vi.mock('../../../services/cards/cardCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/cards/cardCatalog')>();
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

const editor: { current: UseDeckEditor | null } = { current: null };
const location: { pathname: string } = { pathname: '' };

function DraftProbe({ token }: { token: string }) {
  editor.current = useDeckEditor(null, token);
  location.pathname = useLocation().pathname;
  return null;
}

function setupDraft(token: string) {
  const webClient = createMockWebClient();
  const result = renderWithProviders(<DraftProbe token={token} />, {
    preloadedState: connectedState,
    webClient,
    route: `/deck/draft/${token}`,
  });
  return { ...result, webClient };
}

beforeEach(() => {
  clearDeckEditorCache();
  editor.current = null;
});

describe('useDeckEditor draft', () => {
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
      expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();
      expect(editor.current!.saveState).toBe('saving');

      act(() => {
        store.dispatch(server.Actions.deckUpload({
          path: '',
          requestId: vi.mocked(webClient.request.session.deckUpload).mock.calls[0][5],
          treeItem: { id: 42, name: 'Burn v2' } as Parameters<typeof server.Actions.deckUpload>[0]['treeItem'],
        }));
      });
      expect(editor.current!.saveState).toBe('saved');
      expect(location.pathname).toBe('/deck/42');
      expect(getCachedDeck(42)?.deck.name).toBe('Burn v2');
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
