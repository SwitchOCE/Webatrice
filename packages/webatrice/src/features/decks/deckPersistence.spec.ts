import { isFieldSet } from '@bufbuild/protobuf';

import type { WebClient } from '@cockatrice/sockatrice';
import { Command_DeckUploadSchema, Command_DeckUpload_ext, Response_DeckUpload_ext } from '@cockatrice/sockatrice/generated';
import { parseCod } from '@app/services';

import { serializeDeckForSave, uploadDeckUpdate } from './deckPersistence';
import type { HydratedDeck } from './types';

const deck: HydratedDeck = {
  name: 'Burn',
  meta: { v: 1, updatedAt: '2020-01-01T00:00:00.000Z' },
  cards: [{ name: 'Lightning Bolt', quantity: 4, category: 'main', lookupSource: 'scryfall', set: 'm11' }],
  format: 'modern',
  bracketAssessment: {
    level: 2, fingerprint: 'abcdefgh', gameChangers: [], turns: [], turnsRestricted: [],
    denial: [], denialRestricted: [], earlyCombos: [], lateCombos: [],
  },
};

function fakeClient() {
  return {
    protobuf: { sendSessionCommand: vi.fn() },
    request: { session: { deckList: vi.fn() } },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('serializeDeckForSave', () => {
  it('writes the whole deck, including the bracket cache, with a fresh updatedAt', () => {
    const parsed = parseCod(serializeDeckForSave(deck));
    expect(parsed.name).toBe('Burn');
    expect(parsed.format).toBe('modern');
    expect(parsed.bracketAssessment?.level).toBe(2);
    expect(parsed.meta.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('uploadDeckUpdate', () => {
  it('sends a deck-id update without a storage path', () => {
    const client = fakeClient();
    uploadDeckUpdate(client as unknown as WebClient, 5, '<xml/>');

    const [ext, command, options] = client.protobuf.sendSessionCommand.mock.calls[0];
    expect(ext).toBe(Command_DeckUpload_ext);
    expect(command).toEqual(expect.objectContaining({ deckId: 5, deckList: '<xml/>' }));
    expect(isFieldSet(command, Command_DeckUploadSchema.field.path)).toBe(false);
    expect(options.responseExt).toBe(Response_DeckUpload_ext);
  });

  it('reports the ack immediately and refreshes the tree once a burst of saves settles', () => {
    vi.useFakeTimers();
    const client = fakeClient();
    const onDone = vi.fn();

    uploadDeckUpdate(client as unknown as WebClient, 5, 'a', onDone);
    uploadDeckUpdate(client as unknown as WebClient, 5, 'b', onDone);
    for (const [, , options] of client.protobuf.sendSessionCommand.mock.calls) {
      options.onSuccess();
    }

    expect(onDone).toHaveBeenCalledTimes(2);
    expect(client.request.session.deckList).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(client.request.session.deckList).toHaveBeenCalledTimes(1);
  });

  it('reports a rejected or unanswered upload without refreshing the tree', () => {
    vi.useFakeTimers();
    const client = fakeClient();
    const onDone = vi.fn();
    const onFailed = vi.fn();

    uploadDeckUpdate(client as unknown as WebClient, 5, 'a', onDone, onFailed);
    client.protobuf.sendSessionCommand.mock.calls[0][2].onError();

    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(client.request.session.deckList).not.toHaveBeenCalled();
  });
});
