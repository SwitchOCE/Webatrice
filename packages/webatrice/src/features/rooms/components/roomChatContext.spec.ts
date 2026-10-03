import { create } from '@bufbuild/protobuf';
import { Event_RoomSaySchema } from '@cockatrice/sockatrice/generated';
import type { Message } from '@cockatrice/datatrice';

import { roomChatContext } from './roomChatContext';

const at = new Date(2026, 0, 1, 12, 30, 5).getTime();

function stored(name: string, message: string): Message {
  // As rooms.reducer stores it: normalizeUserMessage prefixes "name: ".
  return { ...create(Event_RoomSaySchema, { name, message: name ? `${name}: ${message}` : message }), timeReceived: at };
}

describe('roomChatContext', () => {
  it('strips the display prefix and drops system lines', () => {
    expect(roomChatContext([stored('', 'Server restarting'), stored('mallory', 'a: b')]))
      .toBe('[12:30:05] mallory: a: b');
  });

  it('is empty for a room without messages', () => {
    expect(roomChatContext(undefined)).toBe('');
  });
});
