import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { RouteEnum } from '@app/types';

import { isAdmin, isModerator, USER_MENU_ENTRIES, UserMenuDialog, visibleUserMenuEntries } from './userMenuEntries';

const routes = (userLevel: number) => visibleUserMenuEntries(userLevel).flatMap((entry) => entry.route ?? []);
const dialogs = (userLevel: number) => visibleUserMenuEntries(userLevel).flatMap((entry) => entry.dialog ?? []);
const registered = Level.IsUser | Level.IsRegistered;

describe('userMenuEntries', () => {
  it('offers Account, Settings and Shortcuts to every signed-in user', () => {
    expect(routes(registered)).toEqual([RouteEnum.ACCOUNT, RouteEnum.SETTINGS, RouteEnum.SHORTCUTS]);
  });

  it('adds Logs for moderators and for developers, like desktop TabSupervisor', () => {
    expect(routes(registered | Level.IsModerator)).toContain(RouteEnum.LOGS);
    expect(routes(registered | Level.IsDeveloper)).toContain(RouteEnum.LOGS);
  });

  it('offers card import and the debug log to every signed-in user', () => {
    expect(dialogs(registered)).toEqual([UserMenuDialog.CardImport, UserMenuDialog.DebugLog]);
  });

  it('reads user-level flags as a bitmask', () => {
    expect(isModerator(Level.IsModerator | Level.IsAdmin)).toBe(true);
    expect(isAdmin(Level.IsModerator)).toBe(false);
    expect(isAdmin(Level.IsAdmin)).toBe(true);
  });

  it('gives every entry a namespaced label and a distinct destination', () => {
    const destinations = USER_MENU_ENTRIES.map((entry) => entry.route ?? entry.dialog);
    expect(new Set(destinations).size).toBe(destinations.length);
    USER_MENU_ENTRIES.forEach((entry) => expect(entry.label).toMatch(/^UserMenu\./));
  });
});
