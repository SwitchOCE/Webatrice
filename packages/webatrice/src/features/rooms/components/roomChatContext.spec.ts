import { create } from '@bufbuild/protobuf';
import { Event_RoomSaySchema, Event_RoomSay_RoomMessageType } from '@cockatrice/sockatrice/generated';
import type { Message } from '@cockatrice/datatrice';

import { roomChatContext } from './roomChatContext';

const at = new Date(2026, 0, 1, 12, 30, 5).getTime();

function stored(name: string, message: string): Message {
  // As rooms.reducer stores it: normalizeUserMessage prefixes "name: ".
  return { ...create(Event_RoomSaySchema, { name, message: name ? `${name}: ${message}` : message }), timeReceived: at };
}

describe('roomChatContext', () => {
  it('keeps the original history time in the message, alongside its arrival time', () => {
    const message = stored('mallory', 'old message');
    message.messageType = Event_RoomSay_RoomMessageType.ChatHistory;
    message.timeOf = BigInt(new Date(2025, 11, 31, 23, 5, 7).getTime());
    expect(roomChatContext([message])).toBe('[12:30:05] mallory: [31 Dec 2025 23:05:07] old message');
    message.timeOf = 0n;
    expect(roomChatContext([message])).toBe('[12:30:05] mallory: old message');
  });

  it('strips the display prefix and drops system lines', () => {
    expect(roomChatContext([stored('', 'Server restarting'), stored('mallory', 'a: b')]))
      .toBe('[12:30:05] mallory: a: b');
  });

  it('is empty for a room without messages', () => {
    expect(roomChatContext(undefined)).toBe('');
  });
});
