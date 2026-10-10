import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';

import { getNotificationPermission, requestNotificationPermission, watchNotificationPermission } from '@app/services';

import type { CustomControlProps } from '../registry';

export default function NotificationPermissionControl({ id, labelId, describedBy }: CustomControlProps) {
  const { t } = useTranslation();
  const [permission, setPermission] = useState(getNotificationPermission);

  useEffect(() => watchNotificationPermission(setPermission), []);

  const request = async () => {
    setPermission(await requestNotificationPermission());
  };

  return (
    <span className="settings-permission" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
      <span className="settings-permission__status" data-permission={permission} aria-live="polite">
        {t(`SettingsUserInterface.browserNotifications.status.${permission}`)}
      </span>
      {permission === 'default' && (
        <button id={id} type="button" className="settings-button" onClick={request}>
          <Bell size={14} aria-hidden />
          {t('SettingsUserInterface.browserNotifications.request')}
        </button>
      )}
    </span>
  );
}
