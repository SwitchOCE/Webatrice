import { useEffect, useId, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { FormatPicker } from '../components/FormatPicker';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { DeckDialogFrame } from './DeckDialogFrame';

export interface CreateDeckDialogProps {
  open: boolean;
  onClose: () => void;
  /** Trimmed name (may be empty) and lower-cased format. */
  onCreate: (name: string, format: string) => void;
}

export function CreateDeckDialog({ open, onClose, onCreate }: CreateDeckDialogProps) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState('commander');

  useEffect(() => {
    if (!open) {
      return;
    }
    setName('');
    setFormat('commander');
  }, [open]);

  useEscapeKey(open, onClose);
  const titleId = useId();

  if (!open) {
    return null;
  }

  // An empty name is fine (the deck becomes "New Deck"), but "Other" with
  // nothing typed keeps the user here.
  const trimmedFormat = format.trim();
  const submitDisabled = !trimmedFormat;

  const handleSubmit = () => {
    if (submitDisabled) {
      return;
    }
    onCreate(name.trim(), trimmedFormat.toLowerCase());
  };

  return (
    <DeckDialogFrame onClose={onClose} titleId={titleId}>
      <div
        className={[
          'relative w-full max-w-md rounded-xl bg-bg-surface border',
          'border-border-subtle shadow-glow overflow-hidden flex flex-col',
        ].join(' ')}
      >
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h2 id={titleId} className="font-modern text-lg font-semibold text-text-primary">Create a deck</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Deck name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit();
                }
              }}
              maxLength={80}
              placeholder="Untitled Deck"
              autoFocus
              className={[
                'mt-1 w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors',
              ].join(' ')}
            />
          </label>
          <div>
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1">
              Format
            </span>
            <FormatPicker value={format} onChange={setFormat} variant="dialog" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={[
              'px-3 py-1.5 rounded-md text-sm font-medium text-text-secondary',
              'hover:text-text-primary hover:bg-bg-elevated transition-colors',
            ].join(' ')}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className={[
              'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold bg-accent text-white',
              'hover:bg-accent-hover shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
            ].join(' ')}
          >
            <Plus size={13} /> Create
          </button>
        </div>
      </div>
    </DeckDialogFrame>
  );
}
