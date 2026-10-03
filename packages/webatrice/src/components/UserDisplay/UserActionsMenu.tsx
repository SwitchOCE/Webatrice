import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, generatePath } from 'react-router-dom';
import { Flag, MessageSquare, UserRoundPlus, UserRoundMinus, VolumeX, Volume2 } from 'lucide-react';

import { useReportUser } from '@app/dialogs';
import { RouteEnum } from '@app/types';
import { Menu, MenuItem, MenuSeparator, MENU_ITEM_CLASS, type MenuAnchor } from '../Menu';
import { useUserMenuSlot } from './UserMenuSlot';

interface UserActionsMenuProps {
  anchor: MenuAnchor;
  /** The name link that opened the menu; focus returns to it on close. */
  triggerRef?: RefObject<HTMLElement | null>;
  name: string;
  /** Target's userLevel, forwarded to slot entries (e.g. moderator promote/demote). */
  userLevel?: number;
  isABuddy: boolean;
  isIgnored: boolean;
  onClose: () => void;
  onAddBuddy: () => void;
  onRemoveBuddy: () => void;
  onAddIgnore: () => void;
  onRemoveIgnore: () => void;
}

/**
 * Context menu for a user name — shared between `UserDisplay` (buddies /
 * players-online lists) and any chat surface that exposes the same actions on
 * message-author names (see `Message.PlayerLink`). Cockatrice-parity items:
 * Private chat (opens the Player page's chat panel), buddy toggle, ignore
 * toggle, and Report user, then whatever the slot adds (moderator actions,
 * the user's games).
 *
 * Built on `Menu`, so it opens from the keyboard too (Shift+F10 / Menu key on
 * the name), takes focus, and closes on outside click, Escape, Tab or after
 * any option is chosen.
 */
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

  return (
    <Menu anchor={anchor} label={t('UserActionsMenu.label', { name })} onClose={onClose} triggerRef={triggerRef}>
      {/* Cockatrice-parity label. Opens the Player page which hosts the
       *  PrivateChat panel for this user. */}
      <NavLink
        to={generatePath(RouteEnum.PLAYER, { name })}
        onClick={onClose}
        className={MENU_ITEM_CLASS}
        role="menuitem"
        tabIndex={-1}
      >
        <MessageSquare size={14} /> {t('UserActionsMenu.privateChat')}
      </NavLink>
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
      {/* Desktop UserContextMenu lists "Report user" when the server takes
       *  reports and you are registered, enabled for anyone but yourself. A
       *  name inside a chat's ReportChatScope attaches that chat's log. */}
      {reportingAvailable && (
        <MenuItem
          onSelect={() => {
            openReportUser({ userName: name });
            onClose();
          }}
          disabled={!canReportUser(name)}
          icon={<Flag size={14} />}
        >
          {t('ReportUserDialog.menuItem')}
        </MenuItem>
      )}
      {Slot && <Slot userName={name} userLevel={userLevel} onClose={onClose} />}
    </Menu>
  );
}
