import { FileText, Keyboard, Settings as SettingsIcon, UserCircle2, type LucideIcon } from 'lucide-react';

import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import { RouteEnum } from '@app/types';

/** Predicate over the signed-in user's `userLevel` bitmask deciding whether an entry is offered. */
export type UserLevelPredicate = (userLevel: number) => boolean;

export interface UserMenuEntry {
  /** i18n key of the menu label. */
  label: string;
  icon: LucideIcon;
  route: RouteEnum;
  /** Omitted: every signed-in user sees the entry. */
  visibleTo?: UserLevelPredicate;
}

const hasLevel = (flag: ServerInfo_User_UserLevelFlag): UserLevelPredicate => (userLevel) => (userLevel & flag) !== 0;

export const isModerator = hasLevel(ServerInfo_User_UserLevelFlag.IsModerator);
export const isAdmin = hasLevel(ServerInfo_User_UserLevelFlag.IsAdmin);
export const isDeveloper = hasLevel(ServerInfo_User_UserLevelFlag.IsDeveloper);
/** Desktop TabSupervisor offers Logs to moderators and, separately, to developers. */
export const canReadLogs: UserLevelPredicate = (userLevel) => isModerator(userLevel) || isDeveloper(userLevel);

/**
 * Navigation offered from the TopBar user menu, in desktop Tabs-menu order and with TabSupervisor's
 * gating (staff tabs check the user-level bits). Adding a destination is a
 * one-line entry here (keep one entry per line so parallel additions rebase cleanly).
 */
export const USER_MENU_ENTRIES: readonly UserMenuEntry[] = [
  { label: 'UserMenu.account', icon: UserCircle2, route: RouteEnum.ACCOUNT },
  { label: 'UserMenu.settings', icon: SettingsIcon, route: RouteEnum.SETTINGS },
  { label: 'UserMenu.shortcuts', icon: Keyboard, route: RouteEnum.SHORTCUTS },
  { label: 'UserMenu.logs', icon: FileText, route: RouteEnum.LOGS, visibleTo: canReadLogs },
];

export const visibleUserMenuEntries = (userLevel: number): UserMenuEntry[] =>
  USER_MENU_ENTRIES.filter((entry) => !entry.visibleTo || entry.visibleTo(userLevel));
