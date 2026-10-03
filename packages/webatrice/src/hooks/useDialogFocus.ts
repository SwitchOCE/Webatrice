import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

/** Elements Tab can land on. Disabled controls and `tabindex="-1"` are left out, as the browser does. */
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

export function tabbableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE))
    .filter((element) => !element.closest('[hidden],[inert]'));
}

// The opener of a dialog that just closed while another took its place in the same commit (a
// loading dialog swapped for the form it was loading). The new dialog adopts it, since the control
// focused when it opened is its own autoFocus field or nothing. Cleared once that commit's effects
// have run, so it never reaches an unrelated dialog.
let handedOver: HTMLElement | null = null;

export interface DialogFocusOptions {
  /** Focus moves in when this turns true and goes back to where it came from when it turns false. */
  isOpen: boolean;
  /** Escape closes the dialog; without it Escape is left alone, like a dialog with no close button. */
  onEscape?: () => void;
}

export interface DialogFocusProps {
  ref: (element: HTMLElement | null) => void;
  tabIndex: number;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Focus model for a modal dialog, the way a Qt dialog window behaves: opening it moves focus
 * inside (to a `[data-autofocus]` element, else the first control of its `[data-dialog-content]`,
 * else its first control, else the dialog itself), Tab and Shift+Tab cycle through its controls
 * only, Escape closes it, and closing it puts focus back on the control that opened it — also when
 * the dialog replaced another one, which hands its opener on.
 *
 * Keys arrive through React, so a dialog opened from inside another one handles them first: an
 * inner dialog stops Escape and ignores Tab from outside its own element, and the outer one in
 * turn ignores Tab from a portalled inner dialog.
 */
export function useDialogFocus({ isOpen, onEscape }: DialogFocusOptions) {
  const container = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!isOpen || !element) {
      return;
    }
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opener = active && active !== document.body && !element.contains(active) ? active : handedOver;
    handedOver = null;
    // A control with React's autoFocus is already focused by the time this runs; leave it there.
    if (!element.contains(document.activeElement)) {
      const content = element.querySelector<HTMLElement>('[data-dialog-content]');
      const target = element.querySelector<HTMLElement>('[data-autofocus]')
        ?? (content && tabbableElements(content)[0])
        ?? tabbableElements(element)[0]
        ?? element;
      target.focus();
    }
    return () => {
      // Hand focus back only when it is still ours to give: inside the closing dialog, or lost to
      // <body> because the focused control unmounted with it. Another dialog that has already
      // taken focus keeps it.
      const current = document.activeElement;
      if (!opener?.isConnected) {
        return;
      }
      if (current == null || current === document.body || element.contains(current)) {
        opener.focus();
      } else if (current.closest('[aria-modal="true"]')) {
        handedOver = opener;
        queueMicrotask(() => {
          handedOver = null;
        });
      }
    };
  }, [isOpen]);

  const ref = useCallback((element: HTMLElement | null) => {
    container.current = element;
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const element = container.current;
    if (!element || !element.contains(event.target as Node)) {
      return;
    }
    if (event.key === 'Escape' && onEscape && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const tabbable = tabbableElements(element);
    if (tabbable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = tabbable[0];
    const last = tabbable[tabbable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === element)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const getDialogProps = (): DialogFocusProps => ({ ref, tabIndex: -1, onKeyDown });

  return { getDialogProps };
}
