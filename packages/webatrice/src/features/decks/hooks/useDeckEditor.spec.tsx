import { act, waitFor } from '@testing-library/react';

import { server } from '@cockatrice/datatrice';
import { Response_ResponseCode } from '@cockatrice/sockatrice/generated';
import { WebsocketTypes } from '@cockatrice/sockatrice/types';
import { lookupCard } from '@app/services';

import { connectedState, createMockWebClient, renderWithProviders } from '../../../__test-utils__';
import { clearDeckEditorCache, getCachedDeck, setCachedDeck } from '../deckEditorCache';
import { deckSaveSignature } from '../deckPersistence';
import { hydrateDeck } from '../hydrate';
import type { HydratedDeck } from '../types';
import { useDeckEditor, type UseDeckEditor } from './useDeckEditor';

vi.mock('../hydrate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hydrate')>()),
  hydrateDeck: vi.fn(),
}));
vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  lookupCard: vi.fn(),
  trackEvent: vi.fn(),
}));

const COD = '<cockatrice_deck version="1"><deckname>Burn</deckname><format>modern</format>'
  + '<zone name="main"><card number="1" name="Sol Ring"/></zone></cockatrice_deck>';

function hydrated(overrides: Partial<HydratedDeck> = {}): HydratedDeck {
  return {
    name: 'Burn',
    meta: { v: 1, updatedAt: 'x' },
    format: 'modern',
    cards: [{ name: 'Sol Ring', quantity: 1, category: 'main', lookupSource: 'scryfall' }],
    ...overrides,
  };
}

let latest: UseDeckEditor;
function Probe({ deckId }: { deckId: number | null }) {
  latest = useDeckEditor(deckId);
  return null;
}

function setup(deckId: number | null = 5) {
  const webClient = createMockWebClient();
  const view = renderWithProviders(<Probe deckId={deckId} />, { preloadedState: connectedState, webClient });
  // The download's request id; outcomes for any other request are ignored.
  const requestId = () => vi.mocked(webClient.request.session.deckDownload).mock.lastCall?.[1];
  return { ...view, webClient, requestId };
}

beforeEach(() => {
  clearDeckEditorCache();
  vi.mocked(hydrateDeck).mockResolvedValue(hydrated());
});

describe('useDeckEditor', () => {
  it('downloads the deck, hydrates it and seeds the session cache', async () => {
    const { webClient, store, requestId } = setup();
    expect(webClient.request.session.deckDownload).toHaveBeenCalledWith(5, expect.any(String));
    expect(latest.loading).toBe(true);

    act(() => {
      store.dispatch(server.Actions.deckDownloaded({ deckId: 5, deck: COD, requestId: requestId() }));
    });

    await waitFor(() => expect(latest.loading).toBe(false));
    expect(latest.deck?.name).toBe('Burn');
    expect(latest.totalMainboardCount).toBe(1);
    expect(getCachedDeck(5)?.savedSignature).toBe(deckSaveSignature(hydrated()));
  });

  it('ignores another deck’s download', () => {
    const { store } = setup();
    act(() => {
      store.dispatch(server.Actions.deckDownloaded({ deckId: 6, deck: COD }));
    });
    expect(hydrateDeck).not.toHaveBeenCalled();
    expect(latest.loading).toBe(true);
  });

  it('reports an unreadable deck as not found', async () => {
    const { store, requestId } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      store.dispatch(server.Actions.deckDownloaded({ deckId: 5, deck: 'not xml', requestId: requestId() }));
    });
    await waitFor(() => expect(latest.notFound).toBe(true));
    expect(latest.loading).toBe(false);
  });

  it('stops loading and explains a timed-out download', () => {
    const { store, requestId } = setup();
    act(() => {
      store.dispatch(server.Actions.deckDownloadFailed({
        deckId: 5,
        requestId: requestId(),
        responseCode: Response_ResponseCode.RespNotConnected,
        failure: WebsocketTypes.CommandFailure.Timeout,
      }));
    });
    expect(latest.loading).toBe(false);
    expect(latest.notFound).toBe(true);
    expect(latest.loadError).toBe('CommandFailure.timeout');
  });

  it('uses the generic download message for a server rejection', () => {
    const { store, requestId } = setup();
    act(() => {
      store.dispatch(server.Actions.deckDownloadFailed({
        deckId: 5, requestId: requestId(), responseCode: Response_ResponseCode.RespNameNotFound,
      }));
    });
    expect(latest.loadError).toBe('DeckEditor.downloadFailed');
  });

  it('ignores another deck’s download failure', () => {
    const { store } = setup();
    act(() => {
      store.dispatch(server.Actions.deckDownloadFailed({ deckId: 6, responseCode: Response_ResponseCode.RespNameNotFound }));
    });
    expect(latest.loading).toBe(true);
    expect(latest.loadError).toBeNull();
  });

  it('serves a deck opened earlier this session without downloading it', () => {
    setCachedDeck(5, { deck: hydrated({ name: 'Cached' }), savedSignature: deckSaveSignature(hydrated()) });
    const { webClient } = setup();
    expect(latest.loading).toBe(false);
    expect(latest.deck?.name).toBe('Cached');
    expect(webClient.request.session.deckDownload).not.toHaveBeenCalled();
  });

  it('applies edits optimistically, marks the deck dirty and mirrors it into the cache', () => {
    setCachedDeck(5, { deck: hydrated(), savedSignature: deckSaveSignature(hydrated()) });
    setup();

    act(() => latest.setName('Burn v2'));
    expect(latest.deck?.name).toBe('Burn v2');
    expect(latest.saveState).toBe('dirty');
    expect(getCachedDeck(5)?.deck.name).toBe('Burn v2');

    act(() => latest.incQuantity(0, 2));
    expect(latest.deck?.cards[0].quantity).toBe(3);
    act(() => latest.setCategory(0, 'sideboard'));
    expect(latest.totalSideboardCount).toBe(3);
    act(() => latest.deleteCard(0));
    expect(latest.deck?.cards).toEqual([]);
  });

  it('adds a card by name, incrementing an existing mainboard row', async () => {
    setCachedDeck(5, { deck: hydrated(), savedSignature: deckSaveSignature(hydrated()) });
    vi.mocked(lookupCard).mockResolvedValue({ found: false, source: 'unknown', name: 'Mox', printings: [] });
    setup();

    await act(() => latest.addCard('sol ring'));
    expect(latest.deck?.cards).toHaveLength(1);
    expect(latest.deck?.cards[0].quantity).toBe(2);

    await act(() => latest.addCard('Mox // Back'));
    expect(lookupCard).toHaveBeenCalledWith('Mox');
    expect(latest.deck?.cards.map((c) => c.name)).toEqual(['Sol Ring', 'Mox']);
  });

  it('does nothing without a deck id', () => {
    const { webClient } = setup(null);
    expect(webClient.request.session.deckDownload).not.toHaveBeenCalled();
  });
});
