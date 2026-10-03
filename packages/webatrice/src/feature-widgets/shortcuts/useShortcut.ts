import { useContext, useEffect, useRef } from 'react';

import { ShortcutContext } from './shortcutContext';
import { ShortcutHandler, ShortcutScope } from './types';

export interface UseShortcutOptions {
  scope: ShortcutScope;
  preventDefault?: boolean;
  enabled?: boolean;
}

export function useShortcut(
  actionId: string,
  handler: ShortcutHandler,
  options: UseShortcutOptions,
): void {
  const { register } = useContext(ShortcutContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const { scope, preventDefault = true, enabled = true } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return register({
      actionId,
      handler: (event) => handlerRef.current(event),
      scope,
      preventDefault,
    });
  }, [register, actionId, scope, preventDefault, enabled]);
}

/**
 * Register one handler for a fixed list of actions, e.g. a group whose
 * operations come from elsewhere. The handler receives the action id. The list
 * must be stable (a module constant): changing it re-registers every entry.
 */
export function useShortcutGroup(
  actionIds: readonly string[],
  handler: (actionId: string, event: KeyboardEvent) => void,
  options: UseShortcutOptions,
): void {
  const { register } = useContext(ShortcutContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const { scope, preventDefault = true, enabled = true } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const unregisters = actionIds.map((actionId) =>
      register({
        actionId,
        handler: (event) => handlerRef.current(actionId, event),
        scope,
        preventDefault,
      }),
    );
    return () => unregisters.forEach((unregister) => unregister());
  }, [register, actionIds, scope, preventDefault, enabled]);
}
