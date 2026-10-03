import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';

export type ModerationAction =
  | 'warnUser'
  | 'warnHistory'
  | 'banUser'
  | 'banHistory'
  | 'adminNotes'
  | 'investigateUser'
  | 'promoteMod'
  | 'demoteMod'
  | 'promoteJudge'
  | 'demoteJudge'
  | 'promoteDeveloper'
  | 'demoteDeveloper';

export interface ModerationMenuEntry {
  action: ModerationAction;
  disabled: boolean;
}

/** Entries in desktop order; each inner group is separated from the next by a divider. */
export type ModerationMenuGroups = ModerationMenuEntry[][];

export interface ModerationMenuInput {
  /** The local user's ServerInfo_User.userLevel. */
  localUserLevel: number;
  /** The target's userLevel, or 0 when unknown (no promote/demote entries then). */
  targetUserLevel: number;
  isSelf: boolean;
  /** Desktop's admin lock (`TabSupervisor::getAdminLocked`): while on, the whole section is hidden. */
  adminLocked?: boolean;
  /** The server offers the Moderation tab's lookups (Cockatrice 3.1): adds "Investigate user". */
  canInvestigate?: boolean;
}

export const MODERATION_MENU_LABEL_KEYS: Record<ModerationAction, string> = {
  warnUser: 'Moderation.menu.warnUser',
  warnHistory: 'Moderation.menu.warnHistory',
  banUser: 'Moderation.menu.banUser',
  banHistory: 'Moderation.menu.banHistory',
  adminNotes: 'Moderation.menu.adminNotes',
  investigateUser: 'Moderation.menu.investigateUser',
  promoteMod: 'Moderation.menu.promoteMod',
  demoteMod: 'Moderation.menu.demoteMod',
  promoteJudge: 'Moderation.menu.promoteJudge',
  demoteJudge: 'Moderation.menu.demoteJudge',
  promoteDeveloper: 'Moderation.menu.promoteDeveloper',
  demoteDeveloper: 'Moderation.menu.demoteDeveloper',
};

const hasFlag = (level: number, flag: ServerInfo_User_UserLevelFlag): boolean => (level & flag) === flag;

/**
 * The moderator/admin section of a user context menu. Mirrors the
 * `!tabSupervisor->getAdminLocked()` block of desktop's
 * `UserContextMenu::showContextMenu` (user_context_menu.cpp), restricted to the
 * commands Webatrice implements (report needs its own UI):
 *
 *  - moderators (and admins, who always carry IsModerator) get warn / warn
 *    history, ban / ban history, admin notes and, on a 3.1 server, investigate;
 *  - admins also get one entry per role (moderator, judge, developer), each a
 *    Demote when the target already holds the role, else a Promote when the
 *    target is registered;
 *  - every entry stays visible but disabled when the target is the local user.
 *
 * Desktop additionally requires its Administration tab to be open and unlocked.
 * That tab opens unlocked for every moderator, so the user level is the gate,
 * and the Administration page's Lock (`adminLocked`) hides the section.
 */
export function buildModerationMenu({
  localUserLevel,
  targetUserLevel,
  isSelf,
  adminLocked = false,
  canInvestigate = false,
}: ModerationMenuInput): ModerationMenuGroups {
  if (adminLocked || !hasFlag(localUserLevel, ServerInfo_User_UserLevelFlag.IsModerator)) {
    return [];
  }

  const entry = (action: ModerationAction): ModerationMenuEntry => ({ action, disabled: isSelf });
  const groups: ModerationMenuGroups = [
    [entry('warnUser'), entry('warnHistory')],
    [entry('banUser'), entry('banHistory')],
    canInvestigate ? [entry('adminNotes'), entry('investigateUser')] : [entry('adminNotes')],
  ];

  if (hasFlag(localUserLevel, ServerInfo_User_UserLevelFlag.IsAdmin)) {
    const isRegistered = hasFlag(targetUserLevel, ServerInfo_User_UserLevelFlag.IsRegistered);
    const roles: ModerationMenuEntry[] = [];
    if (hasFlag(targetUserLevel, ServerInfo_User_UserLevelFlag.IsModerator)) {
      roles.push(entry('demoteMod'));
    } else if (isRegistered) {
      roles.push(entry('promoteMod'));
    }
    if (hasFlag(targetUserLevel, ServerInfo_User_UserLevelFlag.IsJudge)) {
      roles.push(entry('demoteJudge'));
    } else if (isRegistered) {
      roles.push(entry('promoteJudge'));
    }
    if (hasFlag(targetUserLevel, ServerInfo_User_UserLevelFlag.IsDeveloper)) {
      roles.push(entry('demoteDeveloper'));
    } else if (isRegistered) {
      roles.push(entry('promoteDeveloper'));
    }
    if (roles.length > 0) {
      groups.push(roles);
    }
  }

  return groups;
}
