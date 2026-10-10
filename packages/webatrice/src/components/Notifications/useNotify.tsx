import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { showSystemNotification } from '@app/services';
import { usePushToast } from '../Toast';
import NotificationLead from './NotificationLead';
import NotificationToast from './NotificationToast';
import { logNotification, type NotificationInput } from './notificationStore';
import { actionLabel, entryBody, entryTitle, systemTitle } from './notificationText';
import { useOpenNotification } from './useNotifications';

export interface NotifyOptions {
  entry: NotificationInput;
  tag?: string;
  system: boolean;
  toast: boolean;
  read?: boolean;
}

export type NotifyResult = 'system' | 'toast' | 'none';

export function useNotify(): (options: NotifyOptions) => NotifyResult {
  const { t } = useTranslation();
  const pushToast = usePushToast();
  const openNotification = useOpenNotification();

  return useCallback(({ entry, tag, system, toast, read = false }: NotifyOptions): NotifyResult => {
    const id = logNotification(entry, read);
    const open = () => openNotification({ id, target: entry.target });
    const title = entryTitle(t, entry);
    const body = entryBody(t, entry);

    if (system && showSystemNotification({ title: systemTitle(t, entry), body, tag, onClick: open })) {
      return 'system';
    }
    if (!toast) {
      return 'none';
    }
    pushToast(
      <NotificationToast title={body ? t('Notifications.toastTitle', { title }) : title} body={body} />,
      { lead: <NotificationLead entry={entry} size={30} />, action: { label: actionLabel(t, entry.kind), onSelect: open } },
    );
    return 'toast';
  }, [t, pushToast, openNotification]);
}
