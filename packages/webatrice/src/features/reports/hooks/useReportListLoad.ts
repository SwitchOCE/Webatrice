import { useCallback, useEffect, useRef, useState } from 'react';

import { useReduxEffect, type ReduxEffectAction } from '@app/hooks';

export type ReportListLoadState = 'loading' | 'failed' | 'ready';

/** The Datatrice `*CommandFailed` signal and command name a list load fails with. */
export interface ReportListFailure {
  type: string;
  command: string;
}

/**
 * Load state for a report list whose rows arrive through the store: a request
 * is "loading" until the list selector hands back a new array (a list
 * response always builds one) or the command's failure signal arrives.
 */
export function useReportListLoad<T>(
  rows: T[],
  send: () => void,
  failure: ReportListFailure,
): { loadState: ReportListLoadState; refresh: () => void } {
  const [loadState, setLoadState] = useState<ReportListLoadState>('loading');
  const rowsAtRequest = useRef<T[] | null>(null);

  const refresh = useCallback(() => {
    rowsAtRequest.current = rows;
    setLoadState('loading');
    send();
    // `rows` is read at request time only; a new list must not re-send.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [send]);

  useEffect(() => {
    if (rowsAtRequest.current !== null && rows !== rowsAtRequest.current) {
      rowsAtRequest.current = null;
      setLoadState('ready');
    }
  }, [rows]);

  useReduxEffect((action: ReduxEffectAction<{ command: string }>) => {
    if (action.payload.command === failure.command && rowsAtRequest.current !== null) {
      rowsAtRequest.current = null;
      setLoadState('failed');
    }
  }, failure.type, []);

  return { loadState, refresh };
}
