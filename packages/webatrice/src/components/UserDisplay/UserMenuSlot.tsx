import { createContext, useContext, type ComponentType } from 'react';

export interface UserMenuSlotProps {
  userName: string;
  /** The target's ServerInfo_User.userLevel when the surface knows it. */
  userLevel?: number;
  /** Close the host menu (call after an entry is chosen). */
  onClose: () => void;
}

/**
 * Extension point for `UserActionsMenu`. Components cannot import
 * feature-widgets (eslint.boundaries.mjs), so capabilities that add entries to
 * every user context menu — the moderation widget's moderator/admin section —
 * register a component here from above the router, and the menu renders it
 * after its own entries.
 */
const UserMenuSlotContext = createContext<ComponentType<UserMenuSlotProps> | null>(null);

export const UserMenuSlotProvider = UserMenuSlotContext.Provider;

export function useUserMenuSlot(): ComponentType<UserMenuSlotProps> | null {
  return useContext(UserMenuSlotContext);
}
