import type { TFunction } from 'i18next';

import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Desktop TabModeration::formatEpoch: epoch seconds as local "yyyy-MM-dd HH:mm",
 * or "Unknown" for 0 (the server's "never recorded").
 */
export function formatEpoch(seconds: bigint | number, t: TFunction): string {
  const value = Number(seconds);
  if (!value) {
    return t('ModerationPage.value.unknown');
  }
  const date = new Date(value * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Desktop TabModeration::moderatorLoginsResponse: the staff roles in a level mask, "Admin / Moderator". */
export function formatStaffLevel(userLevel: number, t: TFunction): string {
  const levels: string[] = [];
  if (userLevel & ServerInfo_User_UserLevelFlag.IsAdmin) {
    levels.push(t('ModerationPage.level.admin'));
  }
  if (userLevel & ServerInfo_User_UserLevelFlag.IsDeveloper) {
    levels.push(t('ModerationPage.level.developer'));
  }
  if (userLevel & ServerInfo_User_UserLevelFlag.IsModerator) {
    levels.push(t('ModerationPage.level.moderator'));
  }
  if (userLevel & ServerInfo_User_UserLevelFlag.IsJudge) {
    levels.push(t('ModerationPage.level.judge'));
  }
  return levels.join(' / ');
}
