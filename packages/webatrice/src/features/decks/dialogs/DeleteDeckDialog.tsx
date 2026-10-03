import { useEscapeKey } from '../hooks/useEscapeKey';

export interface DeleteDeckDialogProps {
  deckName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation before a deck is permanently removed from the server. */
export function DeleteDeckDialog({ deckName, onCancel, onConfirm }: DeleteDeckDialogProps) {
  useEscapeKey(true, onCancel, window);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete deck"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-bg-surface border border-border-subtle shadow-glow overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="font-modern text-lg font-semibold text-text-primary">Delete deck?</h2>
        </div>
        <div className="px-5 py-4 text-sm text-text-secondary">
          <span className="text-text-primary font-medium">{deckName}</span> will be permanently removed from the server.
          This can't be undone.
        </div>
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={[
              'px-4 py-1.5 rounded-md text-sm font-medium text-text-secondary',
              'hover:text-text-primary hover:bg-bg-elevated transition-colors',
            ].join(' ')}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-md text-sm font-semibold bg-red-500 text-white hover:bg-red-400 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
