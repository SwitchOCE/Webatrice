import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';

export type ModerationAction =
  | 'warnUser'
  | 'warnHistory'
  | 'banUser'
  | 'banHistory'
  | 'adminNotes'
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
  /**
   * Whether the server knows the developer role (protocol 3.1). A 3.0 server
   * ignores `should_be_developer` and still answers RespOk, so the entries are
   * hidden rather than reporting a role change that never happened.
   */
  supportsDeveloperRole: boolean;
}

export const MODERATION_MENU_LABEL_KEYS: Record<ModerationAction, string> = {
  warnUser: 'Moderation.menu.warnUser',
  warnHistory: 'Moderation.menu.warnHistory',
  banUser: 'Moderation.menu.banUser',
  banHistory: 'Moderation.menu.banHistory',
  adminNotes: 'Moderation.menu.adminNotes',
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
 * commands this branch implements (report and investigate need their own UI):
 *
 *  - moderators (and admins, who always carry IsModerator) get warn / warn
 *    history, ban / ban history and admin notes;
 *  - admins also get one entry per role (moderator, judge, developer), each a
 *    Demote when the target already holds the role, else a Promote when the
 *    target is registered;
 *  - the developer entry needs a 3.1 server (`ServerCapability.DEVELOPER_ROLE`);
 *  - every entry stays visible but disabled when the target is the local user.
 *
 * Desktop additionally requires its Administration tab to be open and unlocked;
 * that tab opens unlocked for every moderator, so the user level is the gate here.
 */
export function buildModerationMenu({
  localUserLevel,
  targetUserLevel,
  isSelf,
  supportsDeveloperRole,
}: ModerationMenuInput): ModerationMenuGroups {
  if (!hasFlag(localUserLevel, ServerInfo_User_UserLevelFlag.IsModerator)) {
    return [];
  }

  const entry = (action: ModerationAction): ModerationMenuEntry => ({ action, disabled: isSelf });
  const groups: ModerationMenuGroups = [
    [entry('warnUser'), entry('warnHistory')],
    [entry('banUser'), entry('banHistory')],
    [entry('adminNotes')],
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
    if (supportsDeveloperRole) {
      if (hasFlag(targetUserLevel, ServerInfo_User_UserLevelFlag.IsDeveloper)) {
        roles.push(entry('demoteDeveloper'));
      } else if (isRegistered) {
        roles.push(entry('promoteDeveloper'));
      }
    }
    if (roles.length > 0) {
      groups.push(roles);
    }
  }

  return groups;
}
