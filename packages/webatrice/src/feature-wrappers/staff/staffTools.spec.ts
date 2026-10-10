import { ServerCapability } from '@cockatrice/datatrice';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';

import { visibleStaffTools } from './staffTools';

const { IsRegistered, IsModerator, IsAdmin, IsDeveloper } = ServerInfo_User_UserLevelFlag;
const all = () => true;
const none = () => false;
const ids = (level: number, supports: (c: ServerCapability) => boolean) => visibleStaffTools(level, supports).map((tool) => tool.id);

describe('visibleStaffTools', () => {
  it('shows a moderator every moderator tool the server supports', () => {
    expect(ids(IsRegistered | IsModerator, all)).toEqual(['reports', 'moderation', 'logs', 'administration', 'cardArtRules']);
  });

  it('adds Developer for a developer on a server with the developer role', () => {
    expect(ids(IsRegistered | IsModerator | IsAdmin | IsDeveloper, all)).toContain('developer');
  });

  it('gives a developer who is not a moderator only Logs and Developer', () => {
    expect(ids(IsRegistered | IsDeveloper, all)).toEqual(['logs', 'developer']);
  });

  it('hides the tools an older server cannot serve', () => {
    expect(ids(IsRegistered | IsModerator | IsDeveloper, none)).toEqual(['logs', 'administration']);
  });

  it('hides everything from a plain user', () => {
    expect(ids(IsRegistered, all)).toEqual([]);
  });

  it('checks only the capability each tool needs', () => {
    const cardArtOnly = (capability: ServerCapability) => capability === ServerCapability.CARD_ART;
    expect(ids(IsRegistered | IsModerator, cardArtOnly)).toEqual(['logs', 'administration', 'cardArtRules']);
  });
});
