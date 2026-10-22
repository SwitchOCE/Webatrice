import { generatePath, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { IconButton } from '@app/components';
import { Images } from '@app/images';
import { DebugLogDialog } from '@app/dialogs';
import { RouteEnum } from '@app/types';
import { CardImportDialog } from '@app/feature-widgets/card-import';
import { NotificationBell } from '@app/feature-widgets/notifications';

import LatencyStatus from './LatencyStatus';
import TabList from './TabList';
import UserMenu from './UserMenu';
import { useConnectionState } from './hooks/useConnectionState';
import { useNavRailController } from './hooks/useNavRailController';
import { useNavRailHidden } from './hooks/useNavRailHidden';
import { useSessionTabs } from './hooks/useSessionTabs';
import { focusRailToggle, RAIL_TOGGLE_ID } from './railToggle';
import { UserMenuDialog } from './userMenuEntries';

export default function TopBar() {
  const { t } = useTranslation();
  const connectionState = useConnectionState();
  const { groups, activeKey, close, unreadOf } = useSessionTabs();
  const [railHidden, setRailHidden] = useNavRailHidden();
  const { account, openDialog, closeDialog } = useNavRailController();

  return (
    <header className="relative z-40 flex h-11 shrink-0 items-stretch border-b border-border-subtle bg-bg-surface pr-3">
      <span role="status" className="sr-only">{t(`TopBar.connection.${connectionState}`)}</span>
      <div
        className={[
          'flex shrink-0 items-center justify-center border-r border-border-subtle',
          railHidden ? 'w-9' : 'w-[76px]',
        ].join(' ')}
      >
        <IconButton
          id={RAIL_TOGGLE_ID}
          size="sm"
          label={railHidden ? t('NavRail.toggle.show') : t('NavRail.toggle.hide')}
          onClick={() => setRailHidden(!railHidden)}
        >
          {railHidden ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
        </IconButton>
      </div>
      <div className="flex shrink-0 items-center border-r border-border-subtle px-2.5">
        <NavLink
          end
          to={generatePath(RouteEnum.SERVER)}
          aria-label={t('NavRail.home')}
          className="rounded-ui focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <img src={Images.Logo} alt="" className="h-[30px] w-[30px] rounded-ui-sm" />
        </NavLink>
      </div>
      <TabList
        groups={groups}
        activeKey={activeKey}
        onClose={close}
        unreadOf={unreadOf}
        onLastClosed={focusRailToggle}
      />
      <div className="flex shrink-0 items-center gap-2 pl-2">
        <NotificationBell />
        <LatencyStatus />
        <UserMenu {...account} />
      </div>
      <CardImportDialog
        isOpen={openDialog === UserMenuDialog.CardImport}
        handleClose={closeDialog}
      />
      <DebugLogDialog isOpen={openDialog === UserMenuDialog.DebugLog} onClose={closeDialog} />
    </header>
  );
}
