import { server, type ServerCapability } from '@cockatrice/datatrice';

import { MODERATION_PART_COMMANDS, moderationParts } from './moderationParts';

const on = (version: string) => (capability: ServerCapability) => server.serverSupports(version, capability);

describe('moderationParts', () => {
  it('keeps lookup, warn, ban and the histories on a 3.0 server and drops the 3.1 investigation tools', () => {
    expect(moderationParts(on('3.0.0'))).toEqual({
      lookup: true,
      sanctions: true,
      history: true,
      investigation: false,
      staffLogins: false,
      removeAvatar: false,
      resetPassword: false,
    });
  });

  it('offers every part on a 3.1 server', () => {
    expect(Object.values(moderationParts(on('3.1.0'))).every(Boolean)).toBe(true);
  });

  it('lists the commands each part sends', () => {
    expect(MODERATION_PART_COMMANDS.lookup).toEqual(['getUserInfo']);
    expect(MODERATION_PART_COMMANDS.investigation).toEqual(['reportUserInfo', 'getUserAlts', 'getUserSessions']);
  });
});
