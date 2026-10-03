import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { RouteEnum } from '@app/types';

import { isAdmin, isModerator, USER_MENU_ENTRIES, visibleUserMenuEntries } from './userMenuEntries';

const routes = (userLevel: number) => visibleUserMenuEntries(userLevel).map((entry) => entry.route);
const registered = Level.IsUser | Level.IsRegistered;

describe('userMenuEntries', () => {
  it('offers Account, Settings and Shortcuts to every signed-in user', () => {
    expect(routes(registered)).toEqual([RouteEnum.ACCOUNT, RouteEnum.SETTINGS, RouteEnum.SHORTCUTS]);
  });

  it('adds Logs for moderators, like desktop TabSupervisor', () => {
    expect(routes(registered | Level.IsModerator)).toContain(RouteEnum.LOGS);
  });

  it('reads user-level flags as a bitmask', () => {
    expect(isModerator(Level.IsModerator | Level.IsAdmin)).toBe(true);
    expect(isAdmin(Level.IsModerator)).toBe(false);
    expect(isAdmin(Level.IsAdmin)).toBe(true);
  });

  it('gives every entry a namespaced label and a distinct route', () => {
    const entryRoutes = USER_MENU_ENTRIES.map((entry) => entry.route);
    expect(new Set(entryRoutes).size).toBe(entryRoutes.length);
    USER_MENU_ENTRIES.forEach((entry) => expect(entry.label).toMatch(/^UserMenu\./));
  });
});
