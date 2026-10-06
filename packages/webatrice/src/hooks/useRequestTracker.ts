import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RequestId } from '@cockatrice/sockatrice/types';
import { onSessionEnd } from '@app/services/session';

let nextFallbackId = 0;
function newRequestId(): RequestId {
  return globalThis.crypto?.randomUUID?.() ?? `request-${++nextFallbackId}`;
}

export interface RequestTracker {
  /** Generate an id and supersede the previous latest request. */
  begin(): RequestId;
  /** Missing, superseded and cancelled identities never match. */
  isCurrent(id: RequestId | undefined): boolean;
  /** Invalidate the latest request and every tracked parallel request. */
  cancel(): void;
  /** Register a caller-supplied parallel request independently of begin(). */
  track(id: RequestId): void;
  /** Consume a parallel request once; false means an unrelated or late outcome. */
  settle(id: RequestId | undefined): boolean;
}

/**
 * Client-only outcome ownership. Pass begin()'s id as the command's trailing
 * correlation argument, then check isCurrent(payload.requestId), including
 * after awaits. Call cancel() after committing a terminal outcome.
 * For concurrent requests, track(id) before sending and settle(id) on either
 * outcome. Unmount and session end invalidate both forms automatically.
 */
export function useRequestTracker(): RequestTracker {
  const current = useRef<RequestId | undefined>(undefined);
  const pending = useRef(new Set<RequestId>());
  const mounted = useRef(true);
  const cancel = useCallback(() => {
    current.current = undefined;
    pending.current.clear();
  }, []);
  const begin = useCallback(() => {
    const id = newRequestId();
    if (mounted.current) {
      current.current = id;
    }
    return id;
  }, []);
  const isCurrent = useCallback((id: RequestId | undefined) =>
    mounted.current && id !== undefined && id === current.current, []);
  const track = useCallback((id: RequestId) => {
    if (mounted.current) {
      pending.current.add(id);
    }
  }, []);
  const settle = useCallback((id: RequestId | undefined) =>
    mounted.current && id !== undefined && pending.current.delete(id), []);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = onSessionEnd(cancel);
    return () => {
      mounted.current = false;
      cancel();
      unsubscribe();
    };
  }, [cancel]);

  return useMemo(() => ({ begin, isCurrent, cancel, track, settle }), [begin, isCurrent, cancel, track, settle]);
}
