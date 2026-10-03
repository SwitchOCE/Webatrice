import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DeckDialogFrameProps {
  onClose: () => void;
  /** Id of the panel's heading, which names the dialog for assistive tech. */
  titleId: string;
  children: ReactNode;
}

/**
 * Portal-mounted modal overlay shared by the deck dialogs: a centred
 * column over a blurred backdrop that closes the dialog when clicked.
 * The dialog supplies its own panel as `children` and its own Escape
 * handling (`useEscapeKey`).
 */
export function DeckDialogFrame({ onClose, titleId, children }: DeckDialogFrameProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      {children}
    </div>,
    document.body,
  );
}
