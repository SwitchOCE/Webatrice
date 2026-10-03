import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portal-mounted overlay shared by the deck dialogs: a centred column
 * over a blurred backdrop that closes the dialog when clicked. The
 * dialog supplies its own panel as `children`.
 */
export function DeckDialogFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      {children}
    </div>,
    document.body,
  );
}
