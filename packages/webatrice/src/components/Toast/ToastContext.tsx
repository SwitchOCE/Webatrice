import { createContext, FC, PropsWithChildren, ReactNode, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';

import { ACTIONS, initialState, reducer, ToastEntry } from './reducer';
import Toast, { type ToastSeverity } from './Toast';

export interface PushToastOptions {
  // Icon override for the toast pill. Defaults to the severity icon
  // (CheckCircle for the default 'success' severity), which reads as
  // an odd choice for e.g. incoming chat pings — pass MessageSquare.
  icon?: LucideIcon;
  // Defaults to 'success'. Also picks the default icon and its color.
  severity?: ToastSeverity;
  // Keep the toast until it is dismissed or acted on. Set it for any toast
  // that leads somewhere (useNotify does for notifications with a target):
  // content you act on must not time out (WCAG 2.2.1).
  persistent?: boolean;
}

interface ToastContextValue {
  toasts: Record<string, ToastEntry>;
  addToast: (key: string, children: ReactNode) => void;
  updateToast: (key: string, children: ReactNode) => void;
  openToast: (key: string, children?: ReactNode) => void;
  closeToast: (key: string) => void;
  removeToast: (key: string) => void;
  // Imperative "fire-and-forget" toast for one-off notifications (e.g.
  // incoming private-chat messages). Generates a unique key so the
  // caller doesn't have to coordinate, adds + opens in one step, and
  // returns a `close()` for early dismissal. The entry is removed when
  // the pill closes (auto-hide, Dismiss or `close()`).
  pushToast: (children: ReactNode, options?: PushToastOptions) => { key: string; close: () => void };
}

/** Persistent toasts shown at once; older ones fold into a "+N more" entry until it is expanded. */
export const VISIBLE_PERSISTENT_TOASTS = 3;

const ToastContext = createContext<ToastContextValue>({
  toasts: {},
  addToast: () => {},
  updateToast: () => {},
  openToast: () => {},
  closeToast: () => {},
  removeToast: () => {},
  pushToast: () => ({ key: '', close: () => {} }),
});

export const ToastProvider: FC<PropsWithChildren> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Monotonic counter so successive `pushToast` calls within the same
  // millisecond don't collide on the timestamp part of the key.
  const pushCounter = useRef(0);
  const pushToast = useCallback((toastChildren: ReactNode, options?: PushToastOptions) => {
    pushCounter.current += 1;
    const key = `push:${Date.now()}:${pushCounter.current}`;
    dispatch({
      type: ACTIONS.ADD_TOAST,
      payload: {
        key,
        children: toastChildren,
        icon: options?.icon,
        severity: options?.severity,
        persistent: options?.persistent,
        pushed: true,
      },
    });
    dispatch({ type: ACTIONS.OPEN_TOAST, payload: { key } });
    return {
      key,
      close: () => dispatch({ type: ACTIONS.REMOVE_TOAST, payload: { key } }),
    };
  }, []);
  // Dispatch-only operations are stable so `useToast`'s lifecycle effects can
  // list them as dependencies without re-running on every provider render.
  const addToast = useCallback((key: string, toastChildren: ReactNode) => {
    dispatch({ type: ACTIONS.ADD_TOAST, payload: { key, children: toastChildren } });
  }, []);
  const updateToast = useCallback((key: string, toastChildren: ReactNode) => {
    dispatch({ type: ACTIONS.UPDATE_TOAST, payload: { key, children: toastChildren } });
  }, []);
  const closeToast = useCallback((key: string) => dispatch({ type: ACTIONS.CLOSE_TOAST, payload: { key } }), []);
  const removeToast = useCallback((key: string) => dispatch({ type: ACTIONS.REMOVE_TOAST, payload: { key } }), []);
  const providerState: ToastContextValue = {
    toasts: state.toasts,
    addToast,
    updateToast,
    openToast: (key, toastChildren) => {
      if (import.meta.env.DEV && toastChildren === undefined && !state.toasts[key]) {
        console.warn(`[toast] openToast("${key}") before registration — nothing to show`);
      }
      dispatch({ type: ACTIONS.OPEN_TOAST, payload: { key, children: toastChildren } });
    },
    closeToast,
    removeToast,
    pushToast,
  };
  // Toasts render into a single fixed portal at bottom-right of the
  // viewport, stacked with a small gap. The portal is a persistent
  // "Notifications" landmark holding two live regions that stay mounted
  // for the app's lifetime, so a toast added to either is announced
  // reliably (a live region mounted together with its text often is
  // not): errors go to the assertive region, everything else to the
  // polite one. Plain aria-live rather than alert/status roles, so the
  // always-present empty regions don't read as app-wide alerts.
  const { t } = useTranslation();
  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  // Persistent toasts never leave on their own, so a burst (a run of private
  // messages) would stack up the screen edge. Keep the newest few and fold the
  // rest into "+N more"; expanding shows them all until the stack is short again.
  // The toast holding focus is never folded away, so focus doesn't drop to <body>.
  const [showAllPersistent, setShowAllPersistent] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const persistentKeys = Object.keys(state.toasts).filter((key) => state.toasts[key].isOpen && state.toasts[key].persistent);
  const folded = persistentKeys.length - VISIBLE_PERSISTENT_TOASTS;
  useEffect(() => {
    if (folded <= 0) {
      setShowAllPersistent(false);
    }
  }, [folded]);
  const hidden = new Set(folded > 0 && !showAllPersistent
    ? persistentKeys.slice(0, folded).filter((key) => key !== focusedKey)
    : []);
  const entries = Object.entries(state.toasts).filter(([key]) => !hidden.has(key));
  const renderToast = ([key, entry]: [string, ToastEntry]) => (
    <Toast
      key={key}
      open={entry.isOpen}
      onClose={() => dispatch({ type: entry.pushed ? ACTIONS.REMOVE_TOAST : ACTIONS.CLOSE_TOAST, payload: { key } })}
      icon={entry.icon}
      severity={entry.severity}
      autoHideDuration={entry.persistent ? 0 : undefined}
      onFocusChange={(focused) => setFocusedKey((current) => (focused ? key : current === key ? null : current))}
    >
      {entry.children}
    </Toast>
  );

  return (
    <ToastContext.Provider value={providerState}>
      {children}
      {portalTarget &&
        createPortal(
          <section
            aria-label={t('Toast.region')}
            className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none"
          >
            {folded > 0 && (
              <button
                type="button"
                aria-expanded={showAllPersistent}
                onClick={() => setShowAllPersistent((shown) => !shown)}
                className={[
                  'pointer-events-auto px-3 py-1 rounded-full text-xs text-text-secondary hover:text-text-primary',
                  'bg-bg-surface border border-border-control shadow-glow transition-colors',
                ].join(' ')}
              >
                {showAllPersistent ? t('Toast.showFewer') : t('Toast.more', { count: folded })}
              </button>
            )}
            <div aria-live="assertive" className="flex flex-col gap-2 items-end">
              {entries.filter(([, entry]) => entry.severity === 'error').map(renderToast)}
            </div>
            <div aria-live="polite" className="flex flex-col gap-2 items-end">
              {entries.filter(([, entry]) => entry.severity !== 'error').map(renderToast)}
            </div>
          </section>,
          portalTarget,
        )}
    </ToastContext.Provider>
  );
};

export interface ToastHookOptions {
  key: string;
  // Optional: fire-time-only callers (e.g. KnownHosts) omit this and pass the
  // content to `openToast(children)` instead, so the toast always shows the
  // current-language text rather than whatever was rendered at mount.
  children?: ReactNode;
}

export interface ToastHandle {
  openToast: (children?: ReactNode) => void;
  closeToast: () => void;
  removeToast: () => void;
}

export function useToast({ key, children }: ToastHookOptions): ToastHandle {
  const { addToast, updateToast, openToast, closeToast, removeToast } = useContext(ToastContext);

  // Reserve the key for this component's lifetime: create the entry on mount,
  // remove it on unmount. Keyed on `key` only so remount churn stays minimal.
  // `children` is intentionally excluded: registration is a mount/unmount
  // lifecycle keyed on `key`. Content is refreshed by the effect below.
  useEffect(() => {
    addToast(key, children);
    return () => {
      removeToast(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registration is keyed on `key`; `children` refreshes below
  }, [key, addToast, removeToast]);

  // Keep the registered content current: a language change re-renders with a new
  // `t()` string, so refresh the stored children (the reducer skips no-op
  // updates, so a stable string never churns provider state). Callers that pass
  // content at fire time via `openToast(children)` don't rely on this.
  useEffect(() => {
    updateToast(key, children);
  }, [key, children, updateToast]);

  return {
    openToast: (toastChildren) => openToast(key, toastChildren),
    closeToast: () => closeToast(key),
    removeToast: () => removeToast(key),
  };
}

// Fire-and-forget toast dispatcher. Returns a stable function that
// creates a fresh toast per call (unique key generated internally) and
// opens it immediately. Use for one-off notifications the caller
// doesn't need to control after the fact (e.g. incoming private-chat
// message pings). Prefer `useToast` when the toast is bound to a
// specific piece of UI state that opens/closes it.
export function usePushToast(): (children: ReactNode, options?: PushToastOptions) => { key: string; close: () => void } {
  const { pushToast } = useContext(ToastContext);
  return pushToast;
}
