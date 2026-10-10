import { Code2, ImageOff, ScrollText, ServerCog, ShieldAlert, UserSearch, type LucideIcon } from 'lucide-react';

import { ServerCapability } from '@cockatrice/datatrice';
import { canReadLogs, isDeveloper, isModerator, type UserLevelPredicate } from '@app/hooks';
import { RouteEnum } from '@app/types';

export type StaffToolId = 'reports' | 'moderation' | 'logs' | 'administration' | 'cardArtRules' | 'developer';

export interface StaffTool {
  id: StaffToolId;
  icon: LucideIcon;
  route: RouteEnum;
  visibleTo: UserLevelPredicate;
  requires?: ServerCapability;
  lockable?: boolean;
}

export const STAFF_TOOLS: readonly StaffTool[] = [
  {
    id: 'reports', icon: ShieldAlert, route: RouteEnum.REPORT_QUEUE,
    visibleTo: isModerator, requires: ServerCapability.MODERATION_TOOLS,
  },
  {
    id: 'moderation', icon: UserSearch, route: RouteEnum.MODERATION,
    visibleTo: isModerator, requires: ServerCapability.MODERATION_TOOLS,
  },
  { id: 'logs', icon: ScrollText, route: RouteEnum.LOGS, visibleTo: canReadLogs },
  {
    id: 'administration', icon: ServerCog, route: RouteEnum.ADMINISTRATION,
    visibleTo: isModerator, lockable: true,
  },
  {
    id: 'cardArtRules', icon: ImageOff, route: RouteEnum.CARD_ART_RULES,
    visibleTo: isModerator, requires: ServerCapability.CARD_ART,
  },
  {
    id: 'developer', icon: Code2, route: RouteEnum.DEVELOPER,
    visibleTo: isDeveloper, requires: ServerCapability.DEVELOPER_ROLE,
  },
];

export const visibleStaffTools = (userLevel: number, supports: (capability: ServerCapability) => boolean): StaffTool[] =>
  STAFF_TOOLS.filter((tool) => tool.visibleTo(userLevel) && (!tool.requires || supports(tool.requires)));
