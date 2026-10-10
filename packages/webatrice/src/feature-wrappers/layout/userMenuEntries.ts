import {
  BarChart3, Download, FileText, Flag, Image, Keyboard, ScrollText, Settings as SettingsIcon, ShieldAlert, ShieldCheck,
  UserCircle2, UserSearch, type LucideIcon,
} from 'lucide-react';

import { ServerCapability } from '@cockatrice/datatrice';
import { canReadLogs, isDeveloper, isModerator, type UserLevelPredicate } from '@app/hooks';
import { RouteEnum } from '@app/types';

export type { UserLevelPredicate } from '@app/hooks';
export { isModerator, isAdmin, isDeveloper, canReadLogs } from '@app/hooks';

export enum UserMenuDialog {
  CardImport = 'cardImport',
  DebugLog = 'debugLog',
}

interface UserMenuEntryBase {
  label: string;
  icon: LucideIcon;
  visibleTo?: UserLevelPredicate;
  requires?: ServerCapability;
}

export type CapabilityCheck = (capability: ServerCapability) => boolean;

export interface UserMenuRouteEntry extends UserMenuEntryBase {
  route: RouteEnum;
  dialog?: never;
}

export interface UserMenuDialogEntry extends UserMenuEntryBase {
  dialog: UserMenuDialog;
  route?: never;
}

export type UserMenuEntry = UserMenuRouteEntry | UserMenuDialogEntry;

const { CARD_ART, MODERATION_TOOLS, DEVELOPER_ROLE, REPORTS } = ServerCapability;

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
  { label: 'UserMenu.importCards', icon: Download, dialog: UserMenuDialog.CardImport },
  { label: 'UserMenu.debugLog', icon: ScrollText, dialog: UserMenuDialog.DebugLog },
];

export const visibleUserMenuEntries = (userLevel: number, supports: CapabilityCheck = () => true): UserMenuEntry[] =>
  USER_MENU_ENTRIES.filter((entry) =>
    (!entry.visibleTo || entry.visibleTo(userLevel)) && (!entry.requires || supports(entry.requires)));
