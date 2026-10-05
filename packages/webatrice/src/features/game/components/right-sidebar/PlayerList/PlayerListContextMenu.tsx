import { memo, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import type { ServerInfo_User } from '@cockatrice/sockatrice/generated';
import { Menu, MenuSeparator, type MenuAnchor } from '@app/components';

import type { ContextMenuItem } from '../../context-menus/ContextMenu/ContextMenu';
import ContextMenuEntries from '../../context-menus/ContextMenu/ContextMenuEntries';

/**
 * Right-click context menu for PlayerList rows. Ports
 * `Cockatrice/cockatrice/src/interface/widgets/server/user/user_context_menu.cpp:348`
 * (the `showContextMenu` overload) into a Tailwind popup. Item visibility
 * mirrors Cockatrice's role gating exactly:
 *
 *   - Always shown: header label, User details, Private chat
 *   - Both users registered: Add/remove buddy + ignore toggles
 *   - Local user is host or moderator: Kick from game
 *   - Moderator / admin section: supplied by the moderation feature-widget
 *     (`useModerationMenu`), shared with every other user context menu
 *
 * This is a "controlled" menu — the parent tracks {anchor, target} in
 * state and passes them in, so one menu serves every row, opened by a
 * right-click on the row (at the pointer) or by the row's "More actions"
 * button (under it). It is the shared `Menu`: it takes focus, moves with
 * the arrow keys, and gives focus back to the button on close.
 */

export interface PlayerListMenuTarget {
  userName: string;
  deckHash: string;
  targetIsRegistered: boolean;
  isSelf: boolean;
}

export interface PlayerListMenuLocal {
  isHost: boolean;
  isRegistered: boolean;
  /** A moderator with the admin lock off (desktop `!TabSupervisor::getAdminLocked()`). */
  isModerator: boolean;
  /** Server takes reports and the local user is registered (desktop isOwnUserRegistered). */
  canReport?: boolean;
}

export interface PlayerListMenuActions {
  onCopyHashToClipboard: (deckHash: string) => void;
  onOpenUserDetails: (userName: string) => void;
  onOpenPrivateChat: (userName: string) => void;
  onAddBuddy: (userName: string) => void;
  onRemoveBuddy: (userName: string) => void;
  onAddIgnore: (userName: string) => void;
  onRemoveIgnore: (userName: string) => void;
  onKickFromGame: (userName: string) => void;
  onReportUser?: (userName: string) => void;
}

interface Props {
  anchor: MenuAnchor | null;
  /** The row's "More actions" button, when it opened the menu: focus returns there. */
  triggerRef?: RefObject<HTMLElement | null>;
  target: PlayerListMenuTarget | null;
  local: PlayerListMenuLocal;
  buddyList: { [userName: string]: ServerInfo_User };
  ignoreList: { [userName: string]: ServerInfo_User };
  /** The moderator/admin section, already labelled and gated (empty for regular users). */
  moderationItems: ContextMenuItem[];
  actions: PlayerListMenuActions;
  onDismiss: () => void;
}

function buildItems(
  target: PlayerListMenuTarget,
  local: PlayerListMenuLocal,
  buddyList: Props['buddyList'],
  ignoreList: Props['ignoreList'],
  moderationItems: ContextMenuItem[],
  actions: PlayerListMenuActions,
  t: TFunction,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  if (target.deckHash) {
    items.push({
      label: t('PlayerListContextMenu.copyHash'),
      onClick: () => actions.onCopyHashToClipboard(target.deckHash),
    });
  }
  items.push({
    label: t('PlayerListContextMenu.userDetails'),
    onClick: () => actions.onOpenUserDetails(target.userName),
  });
  // Cockatrice disables Private chat when viewing yourself
  // (user_context_menu.cpp:376). We follow the same gate.
  items.push({
    label: t('PlayerListContextMenu.privateChat'),
    onClick: () => actions.onOpenPrivateChat(target.userName),
    disabled: target.isSelf,
  });

  // Buddy/ignore — only offered when BOTH users are registered
  // (Cockatrice checks own-user + target-user registered flags at
  // user_context_menu.cpp:379-382). Toggle label reflects current state.
  if (local.isRegistered && target.targetIsRegistered && !target.isSelf) {
    items.push({ divider: true });
    const isBuddy = !!buddyList[target.userName];
    items.push({
      label: isBuddy ? t('PlayerListContextMenu.removeBuddy') : t('PlayerListContextMenu.addBuddy'),
      onClick: () => (isBuddy
        ? actions.onRemoveBuddy(target.userName)
        : actions.onAddBuddy(target.userName)),
    });
    const isIgnored = !!ignoreList[target.userName];
    items.push({
      label: isIgnored ? t('PlayerListContextMenu.removeIgnore') : t('PlayerListContextMenu.addIgnore'),
      onClick: () => (isIgnored
        ? actions.onRemoveIgnore(target.userName)
        : actions.onAddIgnore(target.userName)),
    });
  }

  // Report user — desktop lists it for registered users (#7091,
  // user_context_menu.cpp) and disables it on yourself; the game is attached.
  if (local.canReport && actions.onReportUser) {
    const onReportUser = actions.onReportUser;
    items.push({ divider: true });
    items.push({
      label: t('ReportUserDialog.menuItem'),
      onClick: () => onReportUser(target.userName),
      disabled: target.isSelf,
    });
  }

  // Kick from game — Cockatrice offers this to the game host OR to a
  // moderator whose admin lock is off (user_context_menu.cpp:416).
  if (!target.isSelf && (local.isHost || local.isModerator)) {
    items.push({ divider: true });
    items.push({
      label: t('PlayerListContextMenu.kick'),
      onClick: () => actions.onKickFromGame(target.userName),
    });
  }

  items.push(...moderationItems);

  return items;
}

function PlayerListContextMenu({
  anchor,
  triggerRef,
  target,
  local,
  buddyList,
  ignoreList,
  moderationItems,
  actions,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  if (anchor == null || target == null) {
    return null;
  }
  const items = buildItems(target, local, buddyList, ignoreList, moderationItems, actions, t);
  return (
    <Menu
      anchor={anchor}
      label={t('PlayerListContextMenu.label', { name: target.userName })}
      onClose={onDismiss}
      triggerRef={triggerRef}
    >
      {/* Header — Cockatrice shows the user name first so a right-clicked
          row always shows WHO is being acted on. Not an entry: the menu's
          name already says it to assistive technology. */}
      <div className="px-3 py-1.5 text-sm font-semibold text-text-primary truncate" aria-hidden>
        {target.userName}
      </div>
      <MenuSeparator />
      <ContextMenuEntries items={items} />
    </Menu>
  );
}

export default memo(PlayerListContextMenu);
