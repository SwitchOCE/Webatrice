/**
 * Browser counterpart of desktop's tray-icon popups (`QSystemTrayIcon::showMessage`) and taskbar
 * alerts (`QApplication::alert`). Desktop shows a popup only while its window is inactive; here
 * that is "the tab is hidden". Callers fall back to an in-app toast when this declines to show.
 */

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface SystemNotificationOptions {
  title: string;
  body?: string;
  /** Replaces an earlier notification with the same tag instead of stacking a new one. */
  tag?: string;
  /** Runs after the notification is clicked and the tab has been focused. */
  onClick?: () => void;
}

/** Longest body text sent to the OS; long chat lines are cut like the in-app toast preview. */
export const NOTIFICATION_BODY_LIMIT = 100;

/** Prepended to the tab title while a hidden tab has something new. */
export const ATTENTION_MARKER = '(*) ';

const isSupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

export function getNotificationPermission(): NotificationPermissionState {
  return isSupported() ? Notification.permission : 'unsupported';
}

/**
 * Calls `onChange` with the permission whenever it may have changed, including from the browser's
 * own site settings: on the Permissions API's change event where the browser reports
 * notifications there, and whenever the window regains focus. Returns the unsubscribe.
 */
export function watchNotificationPermission(onChange: (permission: NotificationPermissionState) => void): () => void {
  if (!isSupported()) {
    return () => {};
  }
  let active = true;
  let status: PermissionStatus | undefined;
  const report = () => onChange(getNotificationPermission());

  window.addEventListener('focus', report);
  navigator.permissions?.query({ name: 'notifications' }).then(
    (result) => {
      if (active) {
        status = result;
        status.addEventListener('change', report);
      }
    },
    () => {},
  );
  return () => {
    active = false;
    window.removeEventListener('focus', report);
    status?.removeEventListener('change', report);
  };
}

/**
 * Asks the browser for notification permission. Browsers only honour this from a user gesture,
 * so call it from a click handler (the Settings page), never on load.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isSupported()) {
    return 'unsupported';
  }
  if (Notification.permission !== 'default') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export const isPageHidden = (): boolean => typeof document !== 'undefined' && document.hidden;

/**
 * Shows an OS notification if the tab is hidden and permission was granted. Returns whether one
 * was shown, so the caller can fall back to an in-app toast.
 */
export function showSystemNotification({ title, body, tag, onClick }: SystemNotificationOptions): boolean {
  if (!isPageHidden() || getNotificationPermission() !== 'granted') {
    return false;
  }
  try {
    const notification = new Notification(title, {
      body: body ? truncate(body, NOTIFICATION_BODY_LIMIT) : undefined,
      tag,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      onClick?.();
    };
    return true;
  } catch {
    // Chrome on Android only allows notifications from a service worker and throws here.
    return false;
  }
}

let attentionListening = false;

/**
 * Marks the tab title while the tab is hidden — the browser's nearest equivalent of desktop's
 * taskbar flash. The marker is removed as soon as the tab becomes visible again.
 */
export function requestAttention(): void {
  if (!isPageHidden()) {
    return;
  }
  if (!document.title.startsWith(ATTENTION_MARKER)) {
    document.title = ATTENTION_MARKER + document.title;
  }
  if (!attentionListening) {
    attentionListening = true;
    document.addEventListener('visibilitychange', clearAttention);
  }
}

function clearAttention(): void {
  if (document.hidden) {
    return;
  }
  if (document.title.startsWith(ATTENTION_MARKER)) {
    document.title = document.title.slice(ATTENTION_MARKER.length);
  }
  document.removeEventListener('visibilitychange', clearAttention);
  attentionListening = false;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
