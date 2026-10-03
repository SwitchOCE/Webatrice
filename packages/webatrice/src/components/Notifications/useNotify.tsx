import { useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';

import { showSystemNotification } from '@app/services';
import { usePushToast } from '../Toast';
import NotificationToast from './NotificationToast';

export interface NotifyOptions {
  title: string;
  body?: string;
  /** Collapses repeats of the same event (e.g. one per chat peer) into one OS notification. */
  tag?: string;
  /** The user's desktop-popup preference for this event (e.g. showMessagePopups). */
  system: boolean;
  /** Whether to fall back to an in-app toast when no OS notification is shown. */
  toast: boolean;
  icon?: LucideIcon;
  /** Where the notification leads: run on click of either the OS notification or the toast. */
  onActivate?: () => void;
}

export type NotifyResult = 'system' | 'toast' | 'none';

/**
 * The app's single notification path. An OS notification is used only while the tab is hidden
 * and the user granted permission; otherwise the in-app toast stands in, so one event never
 * raises both.
 */
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
      // A toast that leads somewhere stays until it is used or dismissed.
      { icon, persistent: Boolean(onActivate) },
    );
    return 'toast';
  }, [pushToast]);
}
