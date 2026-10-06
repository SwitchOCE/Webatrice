import { server } from '@cockatrice/datatrice';
import { ServerInfo_User_UserLevelFlag as Level } from '@cockatrice/sockatrice/generated';
import { useAppSelector } from '@app/store';

export type UserLevelPredicate = (userLevel: number) => boolean;

const hasLevel = (flag: Level): UserLevelPredicate => (userLevel) => (userLevel & flag) !== 0;

export const isModerator = hasLevel(Level.IsModerator);
export const isAdmin = hasLevel(Level.IsAdmin);
export const isDeveloper = hasLevel(Level.IsDeveloper);
export const canReadLogs: UserLevelPredicate = (userLevel) => isModerator(userLevel) || isDeveloper(userLevel);

/** Shared by navigation, guards and command-family selection. */
export function useUserCapabilities() {
  const user = useAppSelector(server.Selectors.getUser);
  const level = user?.userLevel ?? 0;
  const moderator = isModerator(level);
  const developer = isDeveloper(level);
  return {
    isModerator: moderator,
    isAdmin: isAdmin(level),
    isDeveloper: developer,
    canReadLogs: canReadLogs(level),
    // tab_supervisor.cpp:853-860 gives moderators the full log command family even if also developers.
    developerOnlyLogs: developer && !moderator,
  };
}
