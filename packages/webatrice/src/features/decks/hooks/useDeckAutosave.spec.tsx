import { act } from '@testing-library/react';

import { server } from '@cockatrice/datatrice';
import { create } from '@bufbuild/protobuf';
import { Response_ResponseCode, ServerInfo_DeckStorage_TreeItemSchema } from '@cockatrice/sockatrice/generated';

import { connectedState, createMockWebClient, renderWithProviders } from '../../../__test-utils__';
import { clearDeckEditorCache, getCachedDeck, setCachedDeck } from '../deckEditorCache';
import { deckSaveSignature } from '../deckPersistence';
import type { HydratedDeck } from '../types';
import { AUTOSAVE_DEBOUNCE_MS, useDeckAutosave, type DeckAutosave } from './useDeckAutosave';

const deck: HydratedDeck = { name: 'D', meta: { v: 1, updatedAt: 'x' }, cards: [], format: 'modern' };
const SAVED = deckSaveSignature(deck);
const EDITED: HydratedDeck = { ...deck, name: 'D v2' };

let latest: DeckAutosave;
let current: HydratedDeck | null;
// Stable, like the editor's `readDeck`: a new reader would re-create the
// flush callback and flush on every render.
const readDeck = () => current;

function Probe({ initial }: { initial: string | null }) {
  latest = useDeckAutosave(7, readDeck, initial);
  return null;
}

function setup(initial: string | null = SAVED) {
  const webClient = createMockWebClient();
  const view = renderWithProviders(<Probe initial={initial} />, { preloadedState: connectedState, webClient });
  return { ...view, webClient };
}

function ack(store: { dispatch: (a: unknown) => void }, deckId = 7) {
  act(() => {
    store.dispatch(server.Actions.deckUpdated({
      deckId,
      treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id: deckId, name: 'D' }),
    }));
  });
}

function save() {
  act(() => {
    latest.scheduleSave();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  clearDeckEditorCache();
  current = EDITED;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDeckAutosave', () => {
  it('sends the deck\'s color identity with every update and leaves visibility alone', () => {
    current = {
      ...EDITED,
      cards: [
        { name: 'Counterspell', quantity: 1, category: 'main', lookupSource: 'scryfall', colors: ['U'] },
        { name: 'Duress', quantity: 1, category: 'sideboard', lookupSource: 'scryfall', colors: ['B'] },
      ],
    };
    const { webClient } = setup();
    save();
    const [, , isPublic, colorIdentity] = vi.mocked(webClient.request.session.deckUpdate).mock.calls[0];
    expect(isPublic).toBeUndefined();
    expect(colorIdentity).toBe('UB');
  });

  it('debounces edits into one deckUpdate and reports saving, then saved on the ack', () => {
    const { webClient, store } = setup();

    act(() => {
      latest.scheduleSave();
      latest.scheduleSave();
    });
    expect(latest.saveState).toBe('dirty');
    expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(1);
    const [deckId, xml] = vi.mocked(webClient.request.session.deckUpdate).mock.calls[0];
    expect(deckId).toBe(7);
    expect(xml).toContain('<deckname>D v2</deckname>');
    expect(latest.saveState).toBe('saving');

    ack(store);
    expect(latest.saveState).toBe('saved');
    expect(latest.savedSignature()).toBe(deckSaveSignature(EDITED));
  });

  it('skips the upload when only the timestamp would change', () => {
    current = { ...deck, meta: { ...deck.meta, updatedAt: 'later' } };
    const { webClient } = setup();
    save();
    expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();
    expect(latest.saveState).toBe('idle');
  });

  it('settles back to saved when an edit is reverted before the debounce fires', () => {
    const { webClient, store } = setup();
    save();
    ack(store);

    current = { ...EDITED, name: 'D v3' };
    act(() => latest.scheduleSave());
    current = EDITED;
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(1);
    expect(latest.saveState).toBe('saved');
  });

  it('does not resend content that is already in flight', () => {
    const { webClient } = setup();
    save();
    save();
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(1);
    expect(latest.saveState).toBe('saving');
  });

  it('reports a failed save and uploads again on the next save', () => {
    const { webClient, store } = setup();
    save();
    act(() => {
      store.dispatch(server.Actions.deckUpdateFailed({ deckId: 7, responseCode: Response_ResponseCode.RespInternalError }));
    });
    expect(latest.saveState).toBe('failed');
    expect(latest.savedSignature()).toBe(SAVED);

    save();
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(2);
  });

  it('ignores answers for other decks and answers with nothing in flight', () => {
    const { store } = setup();
    ack(store);
    expect(latest.saveState).toBe('idle');
    save();
    ack(store, 8);
    expect(latest.saveState).toBe('saving');
  });

  it('keeps the cached signature in step with each acknowledged save', () => {
    setCachedDeck(7, { deck, savedSignature: SAVED });
    const { store } = setup();
    save();
    expect(getCachedDeck(7)?.savedSignature).toBe(SAVED);
    ack(store);
    expect(getCachedDeck(7)?.savedSignature).toBe(deckSaveSignature(EDITED));
  });

  it('flushes a pending save on demand and on unmount', () => {
    const { webClient, unmount } = setup();
    act(() => latest.scheduleSave());
    act(() => latest.flushSave());
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(1);

    current = { ...EDITED, name: 'D v3' };
    act(() => latest.scheduleSave());
    unmount();
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a deck', () => {
    current = null;
    const { webClient } = setup();
    save();
    expect(webClient.request.session.deckUpdate).not.toHaveBeenCalled();
  });

  it('uploads unconditionally after resetSaved, and markSaved marks the deck clean', () => {
    current = deck;
    const { webClient } = setup();
    act(() => latest.resetSaved());
    expect(latest.savedSignature()).toBeNull();
    save();
    expect(webClient.request.session.deckUpdate).toHaveBeenCalledTimes(1);

    act(() => latest.markSaved('sig'));
    expect(latest.saveState).toBe('idle');
    expect(latest.savedSignature()).toBe('sig');
  });
});
