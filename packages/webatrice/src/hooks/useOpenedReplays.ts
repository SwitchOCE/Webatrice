import { useSyncExternalStore } from 'react';

import { getOpenedReplays, subscribeOpenedReplays, type OpenedReplay } from '@app/services';

/** The replays open in replay tabs, in opening order. */
export function useOpenedReplays(): readonly OpenedReplay[] {
  return useSyncExternalStore(subscribeOpenedReplays, getOpenedReplays);
}
