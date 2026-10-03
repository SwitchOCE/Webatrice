import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import type { UserMenuSlotProps } from '@app/components';

import { MODERATION_MENU_LABEL_KEYS } from './moderationMenu';
import { useModerationMenu } from './useModerationMenu';

const ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-text-secondary '
  + 'hover:text-text-primary hover:bg-bg-elevated transition-colors '
  + 'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent';

/**
 * The moderator/admin entries `UserActionsMenu` renders through its slot (room
 * and server user lists, chat author names). Renders nothing for regular users.
 */
const ModerationMenuItems = ({ userName, userLevel, onClose }: UserMenuSlotProps) => {
  const { t } = useTranslation();
  const { groups, open } = useModerationMenu(userName, userLevel);

  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={index}>
          <div className="my-1 border-t border-border-subtle" />
          {group.map(({ action, disabled }) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              disabled={disabled}
              className={ITEM_CLASS}
              onClick={() => {
                open(action);
                onClose();
              }}
            >
              {t(MODERATION_MENU_LABEL_KEYS[action])}
            </button>
          ))}
        </Fragment>
      ))}
    </>
  );
};

export default ModerationMenuItems;
