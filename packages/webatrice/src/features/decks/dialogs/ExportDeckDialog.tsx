import { useEffect, useId, useMemo, useState } from 'react';
import { X, Copy, Check, Download, FileText, Swords, Package } from 'lucide-react';

import { downloadBlob } from '@app/utils';

import { exportDeck, exportFileName, type DeckExportFormat } from '../deckExport';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type { HydratedDeck } from '../types';
import { DeckDialogFrame } from './DeckDialogFrame';

interface FormatDef {
  id: DeckExportFormat;
  label: string;
  icon: typeof FileText;
  extension: string;
  mime: string;
  description: string;
}

const FORMATS: FormatDef[] = [
  {
    id: 'plain',
    label: 'Plain text',
    icon: FileText,
    extension: 'txt',
    mime: 'text/plain',
    description: 'Simple list, grouped by section. Works with most tools.',
  },
  {
    id: 'arena',
    label: 'MTG Arena',
    icon: Swords,
    extension: 'txt',
    mime: 'text/plain',
    description: 'Includes set + collector. Works for Arena, Moxfield, Archidekt imports.',
  },
  {
    id: 'cockatrice',
    label: 'Cockatrice (.cod)',
    icon: Package,
    extension: 'cod',
    mime: 'application/xml',
    description: 'XML deck file for Cockatrice — preserves everything.',
  },
];

/**
 * Deck exporter: a format picker (see `deckExport` for the formats), a
 * live preview of the exported text, and Copy / Download actions.
 */
export function ExportDeckDialog({
  open,
  onClose,
  deck,
}: {
  open: boolean;
  onClose: () => void;
  /** The live editor deck; the preview re-renders as it changes. */
  deck: HydratedDeck;
}) {
  const [exportFormat, setExportFormat] = useState<DeckExportFormat>('plain');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setCopied(false);
    }
  }, [open]);
  useEscapeKey(open, onClose);
  const titleId = useId();

  const content = useMemo(() => exportDeck(deck, exportFormat), [deck, exportFormat]);

  const currentFormat = FORMATS.find((f) => f.id === exportFormat)!;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied — the textarea is still selectable
      // manually via the auto-select-on-focus below.
    }
  };

  const download = () => {
    downloadBlob(content, exportFileName(deck.name, currentFormat.extension), `${currentFormat.mime};charset=utf-8`);
  };

  if (!open) {
    return null;
  }

  return (
    <DeckDialogFrame onClose={onClose} titleId={titleId}>
      <div
        className={[
          'relative w-full max-w-2xl rounded-xl bg-bg-surface border',
          'border-border-subtle shadow-glow p-6 max-h-[calc(100vh-2rem)] flex flex-col',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="mb-4">
          <h2 id={titleId} className="font-modern text-xl font-bold text-text-primary">Export deck</h2>
          <p className="text-xs text-text-muted mt-1 truncate">{deck.name}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {FORMATS.map((f) => {
            const Icon = f.icon;
            const active = f.id === exportFormat;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setExportFormat(f.id)}
                className={[
                  'flex flex-col items-start gap-1 px-3 py-2 rounded-md border text-left transition-colors',
                  active
                    ? 'bg-accent/15 border-accent text-text-primary'
                    : 'bg-bg-elevated border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-strong',
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon size={13} /> {f.label}
                </span>
                <span className="text-[10px] text-text-muted leading-snug">
                  {f.description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 mb-4">
          <textarea
            readOnly
            value={content}
            onFocus={(e) => e.currentTarget.select()}
            className={[
              'w-full h-64 bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-xs font-mono',
              'text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
            ].join(' ')}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-accent',
              'hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors',
            ].join(' ')}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={download}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2',
              'rounded-md bg-bg-elevated hover:bg-border-subtle',
              'text-text-primary text-sm font-medium border border-border-strong transition-colors',
            ].join(' ')}
          >
            <Download size={14} /> Download .{currentFormat.extension}
          </button>
        </div>
      </div>
    </DeckDialogFrame>
  );
}
