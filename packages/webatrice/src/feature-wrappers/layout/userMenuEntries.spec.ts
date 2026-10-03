import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { RouteEnum } from '@app/types';

import { isAdmin, isModerator, USER_MENU_ENTRIES, visibleUserMenuEntries } from './userMenuEntries';

const routes = (userLevel: number) => visibleUserMenuEntries(userLevel).map((entry) => entry.route);
const registered = Level.IsUser | Level.IsRegistered;

describe('userMenuEntries', () => {
  it('offers Account, Settings, Shortcuts and My Reports to every signed-in user', () => {
    expect(routes(registered)).toEqual([RouteEnum.ACCOUNT, RouteEnum.SETTINGS, RouteEnum.SHORTCUTS, RouteEnum.MY_REPORTS]);
  });

  it('adds Logs for moderators and for developers, like desktop TabSupervisor', () => {
    expect(routes(registered | Level.IsModerator)).toContain(RouteEnum.LOGS);
    expect(routes(registered | Level.IsDeveloper)).toContain(RouteEnum.LOGS);
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

describe('userMenuEntries: staff pages', () => {
  const v31 = () => true;
  const v30 = () => false;
  const staff = (userLevel: number, supports: (capability: string) => boolean) =>
    visibleUserMenuEntries(userLevel, supports).map((entry) => entry.route).filter((route) => STAFF_ROUTES.includes(route));
  const STAFF_ROUTES = [RouteEnum.ADMINISTRATION, RouteEnum.CARD_ART_RULES, RouteEnum.MODERATION, RouteEnum.DEVELOPER];

  it('offers nothing to a plain user or a judge', () => {
    expect(staff(registered, v31)).toEqual([]);
    expect(staff(registered | Level.IsJudge, v31)).toEqual([]);
  });

  it('offers moderators and admins the staff tabs in desktop order on a 3.1 server', () => {
    const expected = [RouteEnum.ADMINISTRATION, RouteEnum.CARD_ART_RULES, RouteEnum.MODERATION];
    expect(staff(registered | Level.IsModerator, v31)).toEqual(expected);
    expect(staff(registered | Level.IsModerator | Level.IsAdmin, v31)).toEqual(expected);
  });

  it('keeps Administration and hides the 3.1-only pages on a 3.0 server', () => {
    expect(staff(registered | Level.IsModerator, v30)).toEqual([RouteEnum.ADMINISTRATION]);
    expect(staff(registered | Level.IsDeveloper, v30)).toEqual([]);
  });

  it('offers developers the Developer page', () => {
    expect(staff(registered | Level.IsDeveloper, v31)).toEqual([RouteEnum.DEVELOPER]);
  });
});

describe('userMenuEntries: reports', () => {
  const reportRoutes = (userLevel: number, supports: (capability: string) => boolean) =>
    visibleUserMenuEntries(userLevel, supports)
      .map((entry) => entry.route)
      .filter((route) => route === RouteEnum.MY_REPORTS || route === RouteEnum.REPORT_QUEUE);

  it('offers My Reports to every user and the Report Queue to moderators on a 3.1 server', () => {
    expect(reportRoutes(registered, () => true)).toEqual([RouteEnum.MY_REPORTS]);
    expect(reportRoutes(registered | Level.IsModerator, () => true)).toEqual([RouteEnum.MY_REPORTS, RouteEnum.REPORT_QUEUE]);
  });

  it('places the Report Queue between Card Art Rules and Moderation, as desktop TabSupervisor does', () => {
    const all = visibleUserMenuEntries(registered | Level.IsModerator, () => true).map((entry) => entry.route);
    expect(all.indexOf(RouteEnum.REPORT_QUEUE)).toBe(all.indexOf(RouteEnum.CARD_ART_RULES) + 1);
    expect(all.indexOf(RouteEnum.MODERATION)).toBe(all.indexOf(RouteEnum.REPORT_QUEUE) + 1);
  });

  it('offers neither on a 3.0 server', () => {
    expect(reportRoutes(registered | Level.IsModerator, () => false)).toEqual([]);
  });
});
