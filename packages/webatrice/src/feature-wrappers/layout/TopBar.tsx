import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { IconButton } from '@app/components';
import { NotificationBell } from '@app/feature-widgets/notifications';

import TabList from './TabList';
import { useConnectionState } from './hooks/useConnectionState';
import { useNavRailHidden } from './hooks/useNavRailHidden';
import { useSessionTabs } from './hooks/useSessionTabs';

export default function TopBar() {
  const { t } = useTranslation();
  const connectionState = useConnectionState();
  const [railHidden, setRailHidden] = useNavRailHidden();
  const { groups, activeKey, close, unreadOf } = useSessionTabs();
  const railToggle = useRef<HTMLButtonElement>(null);

  return (
    <header className="relative z-40 flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-surface pl-1.5 pr-2">
      <IconButton
        ref={railToggle}
        size="sm"
        label={railHidden ? t('TopBar.rail.show') : t('TopBar.rail.hide')}
        onClick={() => setRailHidden(!railHidden)}
      >
        {railHidden ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
      </IconButton>
      <span role="status" className="sr-only">{t(`TopBar.connection.${connectionState}`)}</span>
      <TabList
        groups={groups}
        activeKey={activeKey}
        onClose={close}
        unreadOf={unreadOf}
        onLastClosed={() => railToggle.current?.focus()}
      />
      <NotificationBell />
    </header>
  );
}
