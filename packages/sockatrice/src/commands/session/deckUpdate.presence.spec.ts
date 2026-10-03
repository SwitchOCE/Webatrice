// Byte-level verification that `deckUpdate` never marks Command_DeckUpload's
// proto2 `path` field present. Servatrice's `cmdDeckUpload` checks
// `has_path()` before `has_deck_id()`: a present path — even "" — creates a
// new deck in that folder instead of replacing the one named by `deck_id`.
// Pattern: see `../game/attachCard.presence.spec.ts`.

vi.mock('../../WebClient');

import { Mock } from 'vitest';
import { fromBinary, isFieldSet, toBinary } from '@bufbuild/protobuf';

import { WebClient } from '../../WebClient';
import { Command_DeckUploadSchema, type Command_DeckUpload } from '../../generated';
import { deckUpdate } from './deckUpdate';
import { deckUpload } from './deckUpload';

function lastSentMessage(): Command_DeckUpload {
  const calls = (WebClient.instance.protobuf.sendSessionCommand as Mock).mock.calls;
  return calls[calls.length - 1][1] as Command_DeckUpload;
}

describe('Command_DeckUpload proto2 presence (update vs create)', () => {
  it('deckUpdate leaves path unset on the wire', () => {
    deckUpdate(7, '<cockatrice_deck/>');

    const parsed = fromBinary(Command_DeckUploadSchema, toBinary(Command_DeckUploadSchema, lastSentMessage()));

    expect(isFieldSet(parsed, Command_DeckUploadSchema.field.path)).toBe(false);
    expect(isFieldSet(parsed, Command_DeckUploadSchema.field.deckId)).toBe(true);
    expect(parsed.deckId).toBe(7);
    expect(parsed.deckList).toBe('<cockatrice_deck/>');
  });

  it('deckUpload marks an empty root path present, so the server creates a deck', () => {
    deckUpload('', 0, '<cockatrice_deck/>');

    const parsed = fromBinary(Command_DeckUploadSchema, toBinary(Command_DeckUploadSchema, lastSentMessage()));

    expect(isFieldSet(parsed, Command_DeckUploadSchema.field.path)).toBe(true);
  });
});
