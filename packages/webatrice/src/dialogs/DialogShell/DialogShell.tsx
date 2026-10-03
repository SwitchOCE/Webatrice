import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

import { useDialogFocus, useDialogReturnFocus, type ReturnFocusTo } from '@app/hooks';

export interface DialogShellProps {
  isOpen: boolean;
  handleClose?: () => void;
  title: string;
  /** Text that explains the dialog, read out with its title (`aria-describedby`). */
  description?: ReactNode;
  children: ReactNode;
  /** Actions pinned below the scrolling content. A form inside `children` reaches its submit
   *  button here through the button's `form` attribute. */
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Tailwind max-width class, e.g. "max-w-lg". Defaults to "max-w-md"
   *  so login / small-form dialogs sit around 448px wide. Callers who
   *  want the pre-redo `xs`/`sm`/`md` breakpoints should pass the
   *  matching Tailwind class. */
  maxWidth?: string;
  /** Where focus goes on close if the control that opened the dialog has unmounted meanwhile.
   *  Defaults to a `DialogReturnFocusContext` above, else the opener's nearest landmark. */
  returnFocusTo?: ReturnFocusTo;
}

/**
 * Reusable Tailwind modal shell. Replaces the pre-redo MUI Dialog +
 * DialogTitle + DialogContent + IconButton wrapper. Backdrop click
 * and Escape close the modal (only when `handleClose` is provided —
 * matching MUI's behavior where an omitted `onClose` prop kept the
 * modal open). Same public prop contract so every existing caller
 * (KnownHostDialog, Registration, Reset flows) keeps working.
 *
 * Focus follows `useDialogFocus`: it moves into the content on open (mark a
 * control `data-autofocus` to pick it), Tab stays inside, and closing returns
 * focus to the opener (or `returnFocusTo` if the opener has gone). The dialog
 * is named by its heading.
 */
const DialogShell = ({
  isOpen,
  handleClose,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  maxWidth = 'max-w-md',
  returnFocusTo,
}: DialogShellProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const inheritedReturnFocusTo = useDialogReturnFocus();
  const { getDialogProps } = useDialogFocus({
    isOpen,
    onEscape: handleClose,
    returnFocusTo: returnFocusTo ?? inheritedReturnFocusTo,
  });

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      // @critical React bubbles synthetic submit events along the React tree
      onSubmit={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={handleClose}
      />
      <div
        {...getDialogProps()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={[
          'relative z-10 w-full max-h-[90vh] flex flex-col overflow-hidden focus:outline-none',
          'rounded-xl bg-bg-surface border border-border-subtle shadow-glow',
          maxWidth,
          className ?? '',
        ].join(' ')}
      >
        <header className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle">
          <div className="min-w-0">
            <h2 id={titleId} className="font-modern text-lg font-semibold text-text-primary">{title}</h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-xs text-text-secondary">{description}</p>
            )}
          </div>
          {handleClose && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
              title={t('Common.action.close')}
              aria-label={t('Common.action.close')}
            >
              <X size={16} />
            </button>
          )}
        </header>
        <div
          data-dialog-content
          className={[
            'flex-1 min-h-0 overflow-y-auto px-5 py-4 text-sm text-text-secondary',
            contentClassName ?? '',
          ].join(' ')}
        >
          {children}
        </div>
        {footer && (
          <footer className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default DialogShell;
