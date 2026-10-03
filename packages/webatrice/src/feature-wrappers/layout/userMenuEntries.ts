import {
  BarChart3, FileText, Image, Keyboard, Settings as SettingsIcon, ShieldCheck, UserCircle2, UserSearch, type LucideIcon,
} from 'lucide-react';

import { ServerCapability } from '@cockatrice/datatrice';
import { canReadLogs, isDeveloper, isModerator, type UserLevelPredicate } from '@app/hooks';
import { RouteEnum } from '@app/types';

/** Predicate over the signed-in user's `userLevel` bitmask deciding whether an entry is offered. */
export type { UserLevelPredicate } from '@app/hooks';
export { isModerator, isAdmin, isDeveloper, canReadLogs } from '@app/hooks';

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

const { CARD_ART, MODERATION_TOOLS, DEVELOPER_ROLE } = ServerCapability;

/**
 * Navigation offered from the TopBar user menu, in desktop Tabs-menu order and with TabSupervisor's
 * gating (staff tabs check the user-level bits). Adding a destination is a
 * one-line entry here (keep one entry per line so parallel additions rebase cleanly).
 */
export const USER_MENU_ENTRIES: readonly UserMenuEntry[] = [
  { label: 'UserMenu.account', icon: UserCircle2, route: RouteEnum.ACCOUNT },
  { label: 'UserMenu.settings', icon: SettingsIcon, route: RouteEnum.SETTINGS },
  { label: 'UserMenu.shortcuts', icon: Keyboard, route: RouteEnum.SHORTCUTS },
  { label: 'UserMenu.administration', icon: ShieldCheck, route: RouteEnum.ADMINISTRATION, visibleTo: isModerator },
  { label: 'UserMenu.logs', icon: FileText, route: RouteEnum.LOGS, visibleTo: canReadLogs },
  { label: 'UserMenu.cardArtRules', icon: Image, route: RouteEnum.CARD_ART_RULES, visibleTo: isModerator, requires: CARD_ART },
  { label: 'UserMenu.moderation', icon: UserSearch, route: RouteEnum.MODERATION, visibleTo: isModerator, requires: MODERATION_TOOLS },
  { label: 'UserMenu.developer', icon: BarChart3, route: RouteEnum.DEVELOPER, visibleTo: isDeveloper, requires: DEVELOPER_ROLE },
];

export const visibleUserMenuEntries = (userLevel: number, supports: CapabilityCheck = () => true): UserMenuEntry[] =>
  USER_MENU_ENTRIES.filter((entry) =>
    (!entry.visibleTo || entry.visibleTo(userLevel)) && (!entry.requires || supports(entry.requires)));
