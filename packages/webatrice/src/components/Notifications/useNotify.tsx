import { useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';

import { showSystemNotification } from '@app/services';
import { usePushToast } from '../Toast';
import NotificationToast from './NotificationToast';

export interface NotifyOptions {
  title: string;
  body?: string;
  tag?: string;
  system: boolean;
  toast: boolean;
  icon?: LucideIcon;
  onActivate?: () => void;
}

export type NotifyResult = 'system' | 'toast' | 'none';

export function useNotify(): (options: NotifyOptions) => NotifyResult {
  const pushToast = usePushToast();

  return useCallback(({ title, body, tag, system, toast, icon, onActivate }: NotifyOptions): NotifyResult => {
    if (system && showSystemNotification({ title, body, tag, onClick: onActivate })) {
      return 'system';
    }
    if (!toast) {
      return 'none';
    }
    const handle = pushToast(
      <NotificationToast
        title={title}
        body={body}
        onActivate={onActivate && (() => {
          handle.close();
          onActivate();
        })}
      />,
      { icon, persistent: Boolean(onActivate) },
    );
    return 'toast';
  }, [pushToast]);
}
