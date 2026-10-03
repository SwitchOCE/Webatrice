import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, generatePath } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, MessageSquare, UserRoundPlus, UserRoundMinus, VolumeX, Volume2 } from 'lucide-react';

import { server, ServerCapability } from '@cockatrice/datatrice';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';
import { useUserMenuSlot } from './UserMenuSlot';

const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-text-secondary '
  + 'hover:text-text-primary hover:bg-bg-elevated transition-colors';

interface UserActionsMenuProps {
  x: number;
  y: number;
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
 * Portalled right-click context menu for a user name — shared between
 * `UserDisplay` (buddies / players-online lists) and any chat surface
 * that wants to expose the same actions on message-author names (see
 * `Message.PlayerLink`). Cockatrice-parity items: Private chat (opens
 * the Player page's chat panel), buddy toggle, ignore toggle.
 *
 * Closes on outside click, Escape, or after any option is chosen.
 * Portalled into `document.body` so it isn't clipped by ancestors with
 * `overflow: hidden` (chat log containers scroll internally).
 */
export default function UserActionsMenu({
  x,
  y,
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
  const ref = useRef<HTMLDivElement>(null);
  const Slot = useUserMenuSlot();
  const { t } = useTranslation();
  const ownName = useAppSelector((state) => server.Selectors.getUser(state)?.name);
  const deckSharing = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.DECK_SHARING));
  // Desktop UserContextMenu: registered users only, shown disabled for yourself.
  const showPublicDecks = deckSharing && ((userLevel ?? 0) & ServerInfo_User_UserLevelFlag.IsRegistered) !== 0;
  const isSelf = name === ownName;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    // Delay attaching the outside-click listener by a tick so the
    // contextmenu event that opened us doesn't immediately close us.
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', onDocClick);
    });
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp the menu inside the viewport so a click near the bottom or
  // right edge doesn't spawn a menu that runs off-screen.
  const MENU_W = 200;
  const MENU_H = 160;
  const left = Math.min(x, window.innerWidth - MENU_W - 8);
  const top = Math.max(8, Math.min(y, window.innerHeight - MENU_H - 8));
  // Slot entries (moderator actions) can make the menu taller than MENU_H;
  // scroll inside the viewport rather than spill past its bottom edge.
  const maxHeight = window.innerHeight - top - 8;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left, top, maxHeight }}
      className="fixed z-[9999] w-[200px] overflow-y-auto rounded-md bg-bg-surface border border-border-subtle shadow-glow py-1 select-none"
    >
      <NavLink
        to={generatePath(RouteEnum.PLAYER, { name })}
        onClick={onClose}
        className={[
          'flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary',
          'hover:text-text-primary hover:bg-bg-elevated transition-colors',
        ].join(' ')}
        role="menuitem"
      >
        {/* Cockatrice-parity label. Opens the Player page which hosts
         *  the PrivateChat panel for this user. */}
        <MessageSquare size={14} /> Private chat
      </NavLink>
      {showPublicDecks && isSelf && (
        <span role="menuitem" aria-disabled="true" className={`${MENU_ITEM_CLASS} opacity-40 cursor-not-allowed`}>
          <Library size={14} /> {t('UserActionsMenu.viewPublicDecks')}
        </span>
      )}
      {showPublicDecks && !isSelf && (
        <NavLink
          to={generatePath(RouteEnum.PUBLIC_DECKS, { userName: name })}
          onClick={onClose}
          className={MENU_ITEM_CLASS}
          role="menuitem"
        >
          <Library size={14} /> {t('UserActionsMenu.viewPublicDecks')}
        </NavLink>
      )}
      <div className="my-1 border-t border-border-subtle" />
      {!isABuddy ? (
        <button
          type="button"
          onClick={onAddBuddy}
          className={MENU_ITEM_CLASS}
          role="menuitem"
        >
          <UserRoundPlus size={14} /> Add to Buddy List
        </button>
      ) : (
        <button
          type="button"
          onClick={onRemoveBuddy}
          className={MENU_ITEM_CLASS}
          role="menuitem"
        >
          <UserRoundMinus size={14} /> Remove from Buddy List
        </button>
      )}
      {!isIgnored ? (
        <button
          type="button"
          onClick={onAddIgnore}
          className={MENU_ITEM_CLASS}
          role="menuitem"
        >
          <VolumeX size={14} /> Add to Ignore List
        </button>
      ) : (
        <button
          type="button"
          onClick={onRemoveIgnore}
          className={MENU_ITEM_CLASS}
          role="menuitem"
        >
          <Volume2 size={14} /> Remove from Ignore List
        </button>
      )}
      {Slot && <Slot userName={name} userLevel={userLevel} onClose={onClose} />}
    </div>,
    document.body,
  );
}
