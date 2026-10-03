import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';

import { server } from '@cockatrice/datatrice';
import { MenuItem, MenuSeparator, type UserMenuSlotProps } from '@app/components';
import { useAppSelector } from '@app/store';

import { useUserGames } from './useUserGames';

/**
 * "Show this user's games" in `UserActionsMenu`'s slot. Desktop enables it only
 * while the user is online (UserContextMenu: `aShowGames->setEnabled(online)`).
 */
const UserGamesMenuItem = ({ userName, onClose }: UserMenuSlotProps) => {
  const { t } = useTranslation();
  const userGames = useUserGames();
  const isOnline = useAppSelector((state) => server.Selectors.getIsUserOnline(state, userName));

  if (!userGames) {
    return null;
  }

  return (
    <>
      <MenuSeparator />
      <MenuItem
        disabled={!isOnline}
        disabledReason={t('UserGamesDialog.menu.offline')}
        icon={<Gamepad2 size={14} />}
        onSelect={() => {
          userGames.open(userName);
          onClose();
        }}
      >
        {t('UserGamesDialog.menu.showGames')}
      </MenuItem>
    </>
  );
};

export default UserGamesMenuItem;
