import { useCallback, useEffect, useRef, useState } from 'react';

import { useReduxEffect, type ReduxEffectAction } from '@app/hooks';

export type ReportListLoadState = 'loading' | 'failed' | 'ready';

/** The Datatrice `*CommandFailed` signal and command name a list load fails with. */
export interface ReportListFailure {
  type: string;
  command: string;
  successType: string;
}

/**
 * Load state for a report list whose rows arrive through the store: a request
 * is "loading" until its response supplies a new array, or its failure
 * signal arrives. Other changes to cached report rows do not settle it.
 */
export function useReportListLoad<T>(
  rows: T[],
  send: () => void,
  failure: ReportListFailure,
): { loadState: ReportListLoadState; refresh: () => void } {
  const [loadState, setLoadState] = useState<ReportListLoadState>('loading');
  const rowsAtRequest = useRef<T[] | null>(null);
  const responseReceived = useRef(false);

  const refresh = useCallback(() => {
    rowsAtRequest.current = rows;
    responseReceived.current = false;
    setLoadState('loading');
    send();
    // `rows` is read at request time only; a new list must not re-send.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [send]);

  // Assignment/details also replace cached rows. Only a list response may
  // complete a list load; otherwise its later failure would be discarded.
  useReduxEffect(() => {
    responseReceived.current = true;
  }, failure.successType, []);

  useEffect(() => {
    if (responseReceived.current && rowsAtRequest.current !== null && rows !== rowsAtRequest.current) {
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
