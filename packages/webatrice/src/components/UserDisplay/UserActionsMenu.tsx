import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, generatePath } from 'react-router-dom';
import { Flag, Library, MessageSquare, UserRoundPlus, UserRoundMinus, VolumeX, Volume2 } from 'lucide-react';

import { server, ServerCapability } from '@cockatrice/datatrice';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import { useReportUser } from '@app/dialogs';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';
import { Menu, MenuItem, MenuSeparator, MENU_ITEM_CLASS, type MenuAnchor } from '../Menu';
import { useUserMenuSlot } from './UserMenuSlot';

interface UserActionsMenuProps {
  anchor: MenuAnchor;
  triggerRef?: RefObject<HTMLElement | null>;
  name: string;
  userLevel?: number;
  isABuddy: boolean;
  isIgnored: boolean;
  onClose: () => void;
  onAddBuddy: () => void;
  onRemoveBuddy: () => void;
  onAddIgnore: () => void;
  onRemoveIgnore: () => void;
}

export default function UserActionsMenu({
  anchor,
  triggerRef,
  name,
  userLevel,
  isABuddy,
  isIgnored,
  onClose,
  onAddBuddy,
  onRemoveBuddy,
  onAddIgnore,
  onRemoveIgnore,
}: UserActionsMenuProps) {
  const Slot = useUserMenuSlot();
  const { t } = useTranslation();
  const { reportingAvailable, canReportUser, openReportUser } = useReportUser();
  const ownName = useAppSelector((state) => server.Selectors.getUser(state)?.name);
  const deckSharing = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.DECK_SHARING));
  const showPublicDecks = deckSharing && ((userLevel ?? 0) & ServerInfo_User_UserLevelFlag.IsRegistered) !== 0;
  const isSelf = name === ownName;

  return (
    <Menu anchor={anchor} label={t('UserActionsMenu.label', { name })} onClose={onClose} triggerRef={triggerRef}>
      <NavLink
        to={generatePath(RouteEnum.PLAYER, { name })}
        onClick={onClose}
        className={MENU_ITEM_CLASS}
        role="menuitem"
        tabIndex={-1}
      >
        <MessageSquare size={14} /> {t('UserActionsMenu.privateChat')}
      </NavLink>
      {showPublicDecks && isSelf && (
        <MenuItem
          onSelect={onClose}
          disabled
          disabledReason={t('UserActionsMenu.viewPublicDecksSelf')}
          icon={<Library size={14} />}
        >
          {t('UserActionsMenu.viewPublicDecks')}
        </MenuItem>
      )}
      {showPublicDecks && !isSelf && (
        <NavLink
          to={generatePath(RouteEnum.PUBLIC_DECKS, { userName: name })}
          onClick={onClose}
          className={MENU_ITEM_CLASS}
          role="menuitem"
          tabIndex={-1}
        >
          <Library size={14} /> {t('UserActionsMenu.viewPublicDecks')}
        </NavLink>
      )}
      <MenuSeparator />
      {!isABuddy ? (
        <MenuItem onSelect={onAddBuddy} icon={<UserRoundPlus size={14} />}>
          {t('UserActionsMenu.addBuddy')}
        </MenuItem>
      ) : (
        <MenuItem onSelect={onRemoveBuddy} icon={<UserRoundMinus size={14} />}>
          {t('UserActionsMenu.removeBuddy')}
        </MenuItem>
      )}
      {!isIgnored ? (
        <MenuItem onSelect={onAddIgnore} icon={<VolumeX size={14} />}>
          {t('UserActionsMenu.addIgnore')}
        </MenuItem>
      ) : (
        <MenuItem onSelect={onRemoveIgnore} icon={<Volume2 size={14} />}>
          {t('UserActionsMenu.removeIgnore')}
        </MenuItem>
      )}
      {reportingAvailable && (
        <MenuItem
          onSelect={() => {
            openReportUser({ userName: name });
            onClose();
          }}
          disabled={!canReportUser(name)}
          disabledReason={t('ReportUserDialog.menuItemSelf')}
          icon={<Flag size={14} />}
        >
          {t('ReportUserDialog.menuItem')}
        </MenuItem>
      )}
      {Slot && <Slot userName={name} userLevel={userLevel} onClose={onClose} />}
    </Menu>
  );
}
