import { useCallback, useState } from 'react';
import { generatePath, useLocation, useNavigate } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useAppSelector } from '@app/store';
import { usePhaseTrackPinnedSetting, usePreference, useSnapGridSetting, useUnreadCounts } from '@app/hooks';
import type { RouteEnum } from '@app/types';

import { placeBadges, placeForPath, type PlaceKey } from '../navPlaces';
import type { UserMenuProps } from '../UserMenu';
import type { UserMenuDialog } from '../userMenuEntries';
import { useOwnAvatarUrl } from './useOwnAvatarUrl';

export interface NavRailController {
  current: PlaceKey | null;
  badges: Partial<Record<PlaceKey, number>>;
  account: UserMenuProps;
  openDialog: UserMenuDialog | null;
  closeDialog: () => void;
}

export function useNavRailController(): NavRailController {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const webClient = useWebClient();
  const user = useAppSelector(server.Selectors.getUser);
  const serverName = useAppSelector(server.Selectors.getName);
  const avatarUrl = useOwnAvatarUrl();
  const [snapGridVisible, setSnapGridVisible] = useSnapGridSetting();
  const [phaseTrackPinned, setPhaseTrackPinned] = usePhaseTrackPinnedSetting();
  const [openDialog, setOpenDialog] = useState<UserMenuDialog | null>(null);
  const badges = placeBadges(useUnreadCounts(), usePreference('playBadge'));
  const closeDialog = useCallback(() => setOpenDialog(null), []);

  return {
    current: placeForPath(pathname),
    badges,
    openDialog,
    closeDialog,
    account: {
      userName: user?.name ?? null,
      userLevel: user?.userLevel ?? 0,
      avatarUrl,
      serverName,
      snapGridVisible,
      onToggleSnapGrid: () => setSnapGridVisible(!snapGridVisible),
      phaseTrackPinned,
      onTogglePhaseTrackPinned: () => setPhaseTrackPinned(!phaseTrackPinned),
      onNavigate: (route: RouteEnum) => navigate(generatePath(route)),
      onOpenDialog: setOpenDialog,
      onSignOut: () => webClient.request.authentication.disconnect(),
    },
  };
}
