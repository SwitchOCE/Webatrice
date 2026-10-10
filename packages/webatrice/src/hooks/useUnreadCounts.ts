import { selectUnreadCounts, type UnreadCounts } from '@app/services';

import { useNotificationLog } from './useNotificationLog';

export type { UnreadCounts };

export function useUnreadCounts(): UnreadCounts {
  return selectUnreadCounts(useNotificationLog());
}
