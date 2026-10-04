import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useDialogFocus, useDialogReturnFocus } from '@app/hooks';

export interface DeckDialogFrameProps {
  onClose: () => void;
  /** Id of the panel's heading, which names the dialog for assistive tech. */
  titleId: string;
  /** Id of text that explains the dialog, read out with its name. */
  descriptionId?: string;
  /** `alertdialog` for a confirmation that interrupts the user. */
  role?: 'dialog' | 'alertdialog';
  /** What Escape does; defaults to `onClose`. A dialog with a step of its own (a pending
   *  confirmation) backs out of that step first. */
  onEscape?: () => void;
  children: ReactNode;
}

/**
 * Portal-mounted modal overlay shared by the deck dialogs: a centred
 * column over a blurred backdrop that closes the dialog when clicked.
 * The dialog supplies its own panel as `children`.
 *
 * Focus follows `useDialogFocus`, as in `DialogShell`: it moves in on
 * mount (to a `data-autofocus` or `autoFocus` control, else the first
 * control of the panel's `[data-dialog-content]`, so a header Close
 * button is never the landing spot), Tab stays inside, Escape closes,
 * and unmounting returns focus to the control that opened the dialog.
 */
export function DeckDialogFrame({
  onClose,
  titleId,
  descriptionId,
  role = 'dialog',
  onEscape = onClose,
  children,
}: DeckDialogFrameProps) {
  const returnFocusTo = useDialogReturnFocus();
  const { getDialogProps } = useDialogFocus({ isOpen: true, onEscape, returnFocusTo });

  return createPortal(
    <div
      {...getDialogProps()}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 focus:outline-none"
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // @critical React bubbles synthetic events along the React tree, so a
      // submit inside this portal would otherwise reach a form around the opener.
      onSubmit={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      {children}
    </div>,
    document.body,
  );
}
