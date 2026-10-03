import { useCallback, useEffect, useRef, useState } from 'react';

export type ReportListLoadState = 'loading' | 'failed' | 'ready';

/**
 * Load state for a report list whose rows arrive through the store: a request
 * is "loading" until the list selector hands back a new array (a list
 * response always builds one) or the command fails. `send` issues the
 * command with the failure callback.
 */
export function useReportListLoad<T>(
  rows: T[],
  send: (onFailure: () => void) => void,
): { loadState: ReportListLoadState; refresh: () => void } {
  const [loadState, setLoadState] = useState<ReportListLoadState>('loading');
  const rowsAtRequest = useRef<T[] | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    rowsAtRequest.current = rows;
    setLoadState('loading');
    send(() => {
      if (mounted.current) {
        setLoadState('failed');
      }
    });
    // `rows` is read at request time only; a new list must not re-send.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [send]);

  useEffect(() => {
    if (rowsAtRequest.current !== null && rows !== rowsAtRequest.current) {
      rowsAtRequest.current = null;
      setLoadState('ready');
    }
  }, [rows]);

  return { loadState, refresh };
}
