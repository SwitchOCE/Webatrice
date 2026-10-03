import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { server } from '@cockatrice/datatrice';
import { Event_NotifyUser_NotificationType, type Event_NotifyUser } from '@cockatrice/sockatrice/generated';

import { AlertDialog, type AlertDialogSeverity } from '@app/dialogs';
import { useAppSelector } from '@app/store';

export interface NotificationNotice {
  title: string;
  message: string;
  severity: AlertDialogSeverity;
}

/**
 * Maps an Event_NotifyUser to the message box desktop shows for it
 * (TabSupervisor::processNotifyUserEvent). Returns null where desktop shows
 * nothing: a warning without a reason, a custom message without a title or
 * body, and any type this client does not know (desktop's `default:;`).
 */
export function describeNotification(t: TFunction, notification: Event_NotifyUser): NotificationNotice | null {
  switch (notification.type) {
    case Event_NotifyUser_NotificationType.UNKNOWN:
      return { title: t('ServerNotices.unknown.title'), message: t('ServerNotices.unknown.message'), severity: 'info' };
    case Event_NotifyUser_NotificationType.IDLEWARNING:
      return { title: t('ServerNotices.idle.title'), message: t('ServerNotices.idle.message'), severity: 'info' };
    case Event_NotifyUser_NotificationType.PROMOTED:
      return { title: t('ServerNotices.promoted.title'), message: t('ServerNotices.promoted.message'), severity: 'info' };
    case Event_NotifyUser_NotificationType.WARNING: {
      const reason = simplified(notification.warningReason);
      return reason
        ? { title: t('ServerNotices.warning.title'), message: t('ServerNotices.warning.message', { reason }), severity: 'error' }
        : null;
    }
    case Event_NotifyUser_NotificationType.CUSTOM: {
      const title = simplified(notification.customTitle);
      const content = simplified(notification.customContent);
      return title && content
        ? { title, message: t('ServerNotices.custom.message', { content }), severity: 'info' }
        : null;
    }
    default:
      return null;
  }
}

// QString::simplified(): trim and collapse internal whitespace runs.
function simplified(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Server-pushed notices, mirroring desktop:
 *   • Event_ServerShutdown → the "Scheduled server shutdown" box
 *     (ConnectionController::onServerShutdownEvent), here with a live
 *     countdown. Servatrice re-sends the event as the deadline nears; each one
 *     re-opens the notice with the fresh time.
 *   • Event_NotifyUser → one message box per notification, in arrival order
 *     (TabSupervisor::processNotifyUserEvent).
 *
 * Reads both from Datatrice selectors; dismissal is local UI state. Mounted
 * once in AppShell.
 */
export default function ServerNotices() {
  const { t } = useTranslation();
  const shutdown = useAppSelector(server.Selectors.getServerShutdown);
  const notifications = useAppSelector(server.Selectors.getNotifications);

  // --- Shutdown ---
  const [shutdownDeadline, setShutdownDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!shutdown) {
      setShutdownDeadline(null);
      return;
    }
    const at = Date.now();
    setNow(at);
    setShutdownDeadline(at + shutdown.minutes * 60_000);
  }, [shutdown]);

  useEffect(() => {
    if (shutdownDeadline == null) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [shutdownDeadline]);

  // --- Notifications ---
  // Stored messages are immutable, so identity marks the ones already shown.
  const dismissed = useRef(new WeakSet<Event_NotifyUser>());
  const [, setDismissCount] = useState(0);
  // Recomputed every render (the list is capped at MAX_NOTIFICATIONS):
  // dismissing bumps local state, which re-renders past the dismissed entry.
  const current = notifications
    .filter((n) => !dismissed.current.has(n))
    .map((n) => ({ notification: n, notice: describeNotification(t, n) }))
    .find((entry): entry is { notification: Event_NotifyUser; notice: NotificationNotice } => entry.notice !== null);

  if (shutdown && shutdownDeadline != null) {
    return (
      <AlertDialog
        isOpen
        severity="info"
        title={t('ServerNotices.shutdown.title')}
        message={t('ServerNotices.shutdown.message', {
          countdown: formatCountdown(shutdownDeadline - now),
          reason: shutdown.reason,
        })}
        onDismiss={() => setShutdownDeadline(null)}
      />
    );
  }

  if (!current) {
    return null;
  }

  return (
    <AlertDialog
      isOpen
      severity={current.notice.severity}
      title={current.notice.title}
      message={current.notice.message}
      onDismiss={() => {
        dismissed.current.add(current.notification);
        setDismissCount((count) => count + 1);
      }}
    />
  );
}
