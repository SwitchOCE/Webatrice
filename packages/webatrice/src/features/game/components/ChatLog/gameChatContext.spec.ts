import { create } from '@bufbuild/protobuf';
import { ServerInfo_PlayerPropertiesSchema, ServerInfo_UserSchema } from '@cockatrice/sockatrice/generated';
import type { PlayerEntry } from '@cockatrice/datatrice';

import { gameChatContext } from './gameChatContext';

const at = new Date(2026, 0, 1, 8, 0, 0).getTime();

const players = {
  1: { properties: create(ServerInfo_PlayerPropertiesSchema, { playerId: 1, userInfo: create(ServerInfo_UserSchema, { name: 'alice' }) }) },
} as unknown as Record<number, PlayerEntry>;

describe('gameChatContext', () => {
  it('keeps player chat and drops event lines', () => {
    const log = gameChatContext([
      { playerId: 1, message: 'gg', timeReceived: at, kind: 'chat' },
      { playerId: 1, message: 'alice draws a card.', timeReceived: at, kind: 'event' },
    ], players);
    expect(log).toBe('[08:00:00] alice: gg');
  });

  it('drops chat from an unknown seat, which has no name to attribute', () => {
    expect(gameChatContext([{ playerId: 9, message: 'hi', timeReceived: at, kind: 'chat' }], players)).toBe('');
  });
});
