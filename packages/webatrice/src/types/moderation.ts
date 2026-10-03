/** A moderation result or failure, shown in a message box as desktop does. */
export interface ModerationNotice {
  title: string;
  message: string;
  severity: 'info' | 'error';
}
