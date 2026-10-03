import { createContext, useContext, useMemo } from 'react';

import { server, ServerCapability } from '@cockatrice/datatrice';
import { useAdminLocked } from '@app/hooks';
import { useAppSelector } from '@app/store';

import { buildModerationMenu, type ModerationAction, type ModerationMenuGroups } from './moderationMenu';

export interface ModerationApi {
  /** Start the desktop round trip behind a moderator/admin menu entry. */
  open: (action: ModerationAction, userName: string) => void;
}

export const ModerationContext = createContext<ModerationApi | null>(null);

export interface ModerationMenu {
  groups: ModerationMenuGroups;
  open: (action: ModerationAction) => void;
}

const EMPTY_GROUPS: ModerationMenuGroups = [];

/**
 * The moderator/admin section for one user's context menu, gated on the local
 * user's level, the target's level and whether the target is the local user.
 *
 * `userLevel` is the target's level when the surface already holds it (a room
 * or server user row, a game seat); otherwise the online-users list and the
 * last fetched user info are consulted. Empty outside a `ModerationProvider`.
 */
export function useModerationMenu(userName: string, userLevel?: number): ModerationMenu {
  const api = useContext(ModerationContext);
  const localUser = useAppSelector(server.Selectors.getUser);
  const knownLevel = useAppSelector((state) =>
    server.Selectors.getUsers(state)[userName]?.userLevel
    ?? server.Selectors.getUserInfoByName(state, userName)?.userLevel,
  );
  const targetUserLevel = userLevel ?? knownLevel ?? 0;
  const localUserLevel = localUser?.userLevel ?? 0;
  const isSelf = localUser?.name === userName;
  const supportsDeveloperRole = useAppSelector((state) =>
    server.Selectors.supports(state, ServerCapability.DEVELOPER_ROLE),
  );
  const adminLocked = useAdminLocked();
  const canInvestigate = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.MODERATION_TOOLS));

  const groups = useMemo(
    () => (api
      ? buildModerationMenu({ localUserLevel, targetUserLevel, isSelf, supportsDeveloperRole, adminLocked, canInvestigate })
      : EMPTY_GROUPS),
    [api, localUserLevel, targetUserLevel, isSelf, supportsDeveloperRole, adminLocked, canInvestigate],
  );
  const open = useMemo(
    () => (action: ModerationAction) => api?.open(action, userName),
    [api, userName],
  );

  return useMemo(() => ({ groups, open }), [groups, open]);
}
