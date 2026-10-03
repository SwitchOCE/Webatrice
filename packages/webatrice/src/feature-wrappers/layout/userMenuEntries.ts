import {
  BarChart3, FileText, Flag, Image, Keyboard, Settings as SettingsIcon, ShieldAlert, ShieldCheck, UserCircle2, UserSearch,
  type LucideIcon,
} from 'lucide-react';

import { ServerCapability } from '@cockatrice/datatrice';
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
  /** A Cockatrice 3.1 page: hidden unless the connected server offers this capability. */
  requires?: ServerCapability;
}

/** Whether the connected server offers a capability (`server.Selectors.supports`). */
export type CapabilityCheck = (capability: ServerCapability) => boolean;

const hasLevel = (flag: ServerInfo_User_UserLevelFlag): UserLevelPredicate => (userLevel) => (userLevel & flag) !== 0;

export const isModerator = hasLevel(ServerInfo_User_UserLevelFlag.IsModerator);
export const isAdmin = hasLevel(ServerInfo_User_UserLevelFlag.IsAdmin);
export const isDeveloper = hasLevel(ServerInfo_User_UserLevelFlag.IsDeveloper);
/** Desktop TabSupervisor offers Logs to moderators and, separately, to developers. */
export const canReadLogs: UserLevelPredicate = (userLevel) => isModerator(userLevel) || isDeveloper(userLevel);

const { CARD_ART, MODERATION_TOOLS, DEVELOPER_ROLE, REPORTS } = ServerCapability;

/**
 * Navigation offered from the TopBar user menu, in desktop Tabs-menu order and with TabSupervisor's
 * gating (staff tabs check the user-level bits). Adding a destination is a
 * one-line entry here (keep one entry per line so parallel additions rebase cleanly).
 */
export const USER_MENU_ENTRIES: readonly UserMenuEntry[] = [
  { label: 'UserMenu.account', icon: UserCircle2, route: RouteEnum.ACCOUNT },
  { label: 'UserMenu.settings', icon: SettingsIcon, route: RouteEnum.SETTINGS },
  { label: 'UserMenu.shortcuts', icon: Keyboard, route: RouteEnum.SHORTCUTS },
  { label: 'UserMenu.myReports', icon: Flag, route: RouteEnum.MY_REPORTS, requires: REPORTS },
  { label: 'UserMenu.administration', icon: ShieldCheck, route: RouteEnum.ADMINISTRATION, visibleTo: isModerator },
  { label: 'UserMenu.logs', icon: FileText, route: RouteEnum.LOGS, visibleTo: canReadLogs },
  { label: 'UserMenu.cardArtRules', icon: Image, route: RouteEnum.CARD_ART_RULES, visibleTo: isModerator, requires: CARD_ART },
  { label: 'UserMenu.reportQueue', icon: ShieldAlert, route: RouteEnum.REPORT_QUEUE, visibleTo: isModerator, requires: MODERATION_TOOLS },
  { label: 'UserMenu.moderation', icon: UserSearch, route: RouteEnum.MODERATION, visibleTo: isModerator, requires: MODERATION_TOOLS },
  { label: 'UserMenu.developer', icon: BarChart3, route: RouteEnum.DEVELOPER, visibleTo: isDeveloper, requires: DEVELOPER_ROLE },
];

export const visibleUserMenuEntries = (userLevel: number, supports: CapabilityCheck = () => true): UserMenuEntry[] =>
  USER_MENU_ENTRIES.filter((entry) =>
    (!entry.visibleTo || entry.visibleTo(userLevel)) && (!entry.requires || supports(entry.requires)));
