import { useCallback, useState } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useAppSelector } from '@app/store';
import { usePhaseTrackPinnedSetting, useSnapGridSetting } from '@app/hooks';
import type { RouteEnum } from '@app/types';

import { useStaffTools } from '../../staff/useStaffTools';
import type { UserMenuProps } from '../UserMenu';
import type { UserMenuDialog } from '../userMenuEntries';
import { useOwnAvatarUrl } from './useOwnAvatarUrl';
import { clearHomeSnapshot } from '../../../services/storage/homeSnapshot';

export interface AccountMenuAndDialogs {
  account: UserMenuProps;
  openDialog: UserMenuDialog | null;
  closeDialog: () => void;
}

export function useAccountMenuAndDialogs(): AccountMenuAndDialogs {
  const navigate = useNavigate();
  const webClient = useWebClient();
  const user = useAppSelector(server.Selectors.getUser);
  const serverName = useAppSelector(server.Selectors.getName);
  const avatarUrl = useOwnAvatarUrl();
  const [snapGridVisible, setSnapGridVisible] = useSnapGridSetting();
  const [phaseTrackPinned, setPhaseTrackPinned] = usePhaseTrackPinnedSetting();
  const [openDialog, setOpenDialog] = useState<UserMenuDialog | null>(null);
  const staff = useStaffTools();
  const closeDialog = useCallback(() => setOpenDialog(null), []);

  return {
    openDialog,
    closeDialog,
    account: {
      userName: user?.name ?? null,
      userLevel: user?.userLevel ?? 0,
      avatarUrl,
      staffTools: staff.states,
      serverName,
      snapGridVisible,
      onToggleSnapGrid: () => setSnapGridVisible(!snapGridVisible),
      phaseTrackPinned,
      onTogglePhaseTrackPinned: () => setPhaseTrackPinned(!phaseTrackPinned),
      onNavigate: (route: RouteEnum) => navigate(generatePath(route)),
      onOpenDialog: setOpenDialog,
      onSignOut: () => {
        clearHomeSnapshot();
        webClient.request.authentication.disconnect();
      },
    },
  };
}
