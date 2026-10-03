import { CheckCircle2, CircleAlert, FileText, Loader2, Upload, X } from 'lucide-react';

import type { ParsedDeck } from '@app/types';

import { FormatPicker } from '../components/FormatPicker';
import { summarizeUploadedDeck } from '../deckImport';
import { useDeckImportFlow, type DeckImportFlow } from '../hooks/useDeckImportFlow';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { DeckDialogFrame } from './DeckDialogFrame';

const SECONDARY_BUTTON_CLASS =
  'px-3 py-2 rounded-md text-sm font-medium text-text-secondary hover:text-text-primary '
  + 'hover:bg-bg-elevated transition-colors';
const PRIMARY_BUTTON_CLASS =
  'px-4 py-2 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 '
  + 'disabled:cursor-not-allowed text-white font-semibold text-sm shadow-glow '
  + 'transition-colors flex items-center gap-2';

const IMPORT_PLACEHOLDER = `Paste your deck list (Arena / MTGO / Moxfield export). Example:

Commander
1 Atraxa, Grand Unifier

Deck
1 Sol Ring
1 Cultivate
1 Swords to Plowshares
...`;

export interface ImportDeckDialogProps {
  open: boolean;
  onClose: () => void;
  /** Receives the `.cod` XML to upload as a new deck. */
  onImport: (xml: string) => void;
}

/**
 * Two-path importer: paste a list (Moxfield, Arena, MTGO, Cockatrice…)
 * → look the cards up → review matched / unknown → import; or upload a
 * `.cod` file, which skips the review and keeps its metadata.
 */
export function ImportDeckDialog({ open, onClose, onImport }: ImportDeckDialogProps) {
  const flow = useDeckImportFlow(open, onImport);
  useEscapeKey(open, onClose);

  if (!open) {
    return null;
  }

  return (
    <DeckDialogFrame onClose={onClose}>
      <div
        className={[
          'relative w-full max-w-2xl rounded-xl bg-bg-surface border',
          'border-border-subtle shadow-glow p-6 max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col',
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

        <h2 className="font-modern text-xl font-semibold text-text-primary">Import a deck</h2>
        <p className="text-sm text-text-muted mt-1">
          Paste a list from Moxfield, Arena, MTGO, Cockatrice — most formats work.
        </p>

        {flow.error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-danger bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
            <CircleAlert size={14} className="shrink-0 mt-0.5" />
            <span>{flow.error}</span>
          </div>
        )}

        {flow.phase === 'input' && <ImportInputStep flow={flow} />}

        {flow.phase === 'resolving' && <ImportProgress label="Looking up cards…" />}

        {flow.phase === 'review' && <ImportReviewStep flow={flow} />}

        {flow.phase === 'importing' && <ImportProgress label="Creating deck…" />}

        <div className="mt-6 flex items-center justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLASS}>
            Cancel
          </button>
          {flow.phase === 'input' && (
            flow.file ? (
              <button
                type="button"
                onClick={flow.confirmFile}
                className={[
                  'px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white',
                  'font-semibold text-sm shadow-glow transition-colors flex items-center gap-2',
                ].join(' ')}
                title=".cod files are pre-structured — no card review needed"
              >
                <Upload size={14} /> Import file
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void flow.resolve()}
                disabled={!flow.text.trim()}
                className={PRIMARY_BUTTON_CLASS}
              >
                Next: check cards
              </button>
            )
          )}
          {flow.phase === 'review' && (
            <>
              <button type="button" onClick={flow.backToInput} className={SECONDARY_BUTTON_CLASS}>
                Back
              </button>
              <button
                type="button"
                onClick={flow.confirmPaste}
                disabled={flow.resolved.length === 0}
                className={PRIMARY_BUTTON_CLASS}
              >
                <Upload size={14} /> Import {flow.resolved.length} card{flow.resolved.length === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      </div>
    </DeckDialogFrame>
  );
}

function ImportProgress({ label }: { label: string }) {
  return (
    <div className="mt-8 mb-8 flex flex-col items-center gap-2 text-text-secondary text-sm">
      <Loader2 size={20} className="animate-spin text-accent" />
      <div>{label}</div>
    </div>
  );
}

function ImportInputStep({ flow }: { flow: DeckImportFlow }) {
  return (
    <div className="mt-4 flex-1 min-h-0 flex flex-col gap-3">
      <input
        ref={flow.fileInputRef}
        type="file"
        accept=".cod,application/xml,text/xml"
        onChange={(e) => flow.pickFile(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Deck name
          </span>
          <input
            type="text"
            value={flow.name}
            onChange={(e) => flow.setName(e.target.value)}
            maxLength={80}
            className={[
              'mt-1 w-full bg-bg-base border border-border-subtle rounded-md',
              'px-3 py-2 text-sm text-text-primary focus:outline-none',
              'focus:border-accent focus:ring-1 focus:ring-accent transition-colors',
            ].join(' ')}
          />
        </label>
        <div>
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1">
            Format
          </span>
          <FormatPicker value={flow.format} onChange={flow.setFormat} variant="dialog" />
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Decklist
          </span>
          {flow.file ? (
            <button
              type="button"
              onClick={flow.clearFile}
              className="text-xs text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-1"
            >
              <X size={11} /> Clear file
            </button>
          ) : (
            <button
              type="button"
              onClick={() => flow.fileInputRef.current?.click()}
              className="text-xs text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1"
              title="Import from a Cockatrice .cod file (preserves all metadata)"
            >
              <Upload size={11} /> Upload .cod file
            </button>
          )}
        </div>
        {flow.file ? (
          <ImportedFileSummary fileName={flow.file.name} parsed={flow.file.deck} />
        ) : (
          <textarea
            value={flow.text}
            onChange={(e) => flow.setText(e.target.value)}
            placeholder={IMPORT_PLACEHOLDER}
            className={[
              'flex-1 min-h-[240px] bg-bg-base border border-border-subtle rounded-md px-3 py-2',
              'text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none',
              'focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-none',
            ].join(' ')}
          />
        )}
      </div>
    </div>
  );
}

function ImportReviewStep({ flow }: { flow: DeckImportFlow }) {
  return (
    <div className="mt-4 flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 size={14} /> {flow.matchedCount} matched
        </span>
        {flow.missingCount > 0 && (
          <span className="inline-flex items-center gap-1 text-warning">
            <CircleAlert size={14} /> {flow.missingCount} unknown (imported with warning)
          </span>
        )}
        {flow.ignored.length > 0 && (
          <span className="text-text-muted">
            · {flow.ignored.length} unrecognised line{flow.ignored.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="mt-3 flex-1 min-h-0 overflow-y-auto border border-border-subtle rounded-md">
        <ul className="divide-y divide-border-subtle">
          {flow.resolved.map((r, i) => (
            <li
              key={i}
              className={[
                'flex items-center gap-3 px-3 py-1.5 text-sm',
                r.lookup.found ? '' : 'bg-yellow-500/5',
              ].join(' ')}
            >
              <span className="text-xs tabular-nums text-text-muted w-8 text-right">{r.entry.quantity}×</span>
              <span
                className={[
                  'flex-1 truncate',
                  r.lookup.found ? 'text-text-primary' : 'text-warning',
                ].join(' ')}
              >
                {r.entry.name}
              </span>
              <span className="text-xs uppercase tracking-wider text-text-muted">
                {r.entry.category}
              </span>
              {!r.lookup.found && (
                <span className="text-xs text-warning">unknown</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Shown in place of the paste box once a `.cod` file is picked, so the
 * user can confirm the right file before importing.
 */
function ImportedFileSummary({ fileName, parsed }: { fileName: string; parsed: ParsedDeck }) {
  const { total: totalCount, parts } = summarizeUploadedDeck(parsed);

  return (
    <div
      className={[
        'flex-1 min-h-[240px] flex flex-col items-center justify-center',
        'bg-bg-base border border-border-subtle rounded-md p-6 text-center',
      ].join(' ')}
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-bg-elevated border border-border-strong mb-3">
        <FileText size={22} className="text-accent" />
      </div>
      <div className="text-sm font-semibold text-text-primary truncate max-w-full">
        {fileName}
      </div>
      <div className="text-xs text-text-muted mt-1">
        Deck name in file: <span className="text-text-secondary">{parsed.name}</span>
      </div>
      <div className="text-xs text-text-muted mt-3 tabular-nums">
        {totalCount} card{totalCount === 1 ? '' : 's'}
        {parts.length > 0 && <> · {parts.join(' · ')}</>}
      </div>
      {parsed.meta.priceUsd != null && (
        <div className="text-xs text-success mt-1 tabular-nums font-medium">
          ${parsed.meta.priceUsd.toFixed(2)} cached from source
        </div>
      )}
      <div className="text-xs text-text-muted italic mt-4 max-w-sm">
        .cod files are pre-structured — importing skips the card review step and preserves any embedded metadata.
      </div>
    </div>
  );
}
