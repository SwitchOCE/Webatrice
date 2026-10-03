import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { UserMenuSlotProvider, useUserMenuSlot, type UserMenuSlotProps } from '@app/components';

import UserGamesDialog from './UserGamesDialog';
import UserGamesMenuItem from './UserGamesMenuItem';
import { UserGamesContext, type UserGamesApi } from './useUserGames';

/**
 * Hosts desktop's "Show this user's games" for the whole app. Mount once above
 * the routes, inside any provider that already fills `UserActionsMenu`'s slot
 * (the moderation widget): it adds its entry ahead of theirs, and renders the
 * games selector here so it outlives the menu and the list row that opened it.
 */
export const UserGamesProvider = ({ children }: { children: ReactNode }) => {
  const [userName, setUserName] = useState<string | null>(null);
  const api = useMemo<UserGamesApi>(() => ({ open: setUserName }), []);
  const close = useCallback(() => setUserName(null), []);

  const OuterSlot = useUserMenuSlot();
  const Slot = useMemo(() => {
    const UserMenuEntries = (props: UserMenuSlotProps) => (
      <>
        <UserGamesMenuItem {...props} />
        {OuterSlot && <OuterSlot {...props} />}
      </>
    );
    return UserMenuEntries;
  }, [OuterSlot]);

  return (
    <UserGamesContext.Provider value={api}>
      <UserMenuSlotProvider value={Slot}>
        {children}
      </UserMenuSlotProvider>
      {userName && <UserGamesDialog key={userName} userName={userName} onClose={close} />}
    </UserGamesContext.Provider>
  );
};
