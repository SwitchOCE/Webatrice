import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';

import { server } from '@cockatrice/datatrice';
import type { UserMenuSlotProps } from '@app/components';
import { useAppSelector } from '@app/store';

import { useUserGames } from './useUserGames';

const ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-text-secondary '
  + 'hover:text-text-primary hover:bg-bg-elevated transition-colors '
  + 'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent';

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
      <div className="my-1 border-t border-border-subtle" />
      <button
        type="button"
        role="menuitem"
        disabled={!isOnline}
        className={ITEM_CLASS}
        onClick={() => {
          userGames.open(userName);
          onClose();
        }}
      >
        <Gamepad2 size={14} /> {t('UserGamesDialog.menu.showGames')}
      </button>
    </>
  );
};

export default UserGamesMenuItem;
