import { useId } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CheckCircle2, CircleAlert, FileText, Loader2, Upload, X } from 'lucide-react';

import type { ParsedDeck } from '@app/types';

import { DeckLinkHandoff } from '../components/DeckLinkHandoff';
import { FormatPicker } from '../components/FormatPicker';
import { summarizeUploadedDeck } from '../deckImport';
import { useDeckImportFlow, type DeckImportFlow } from '../hooks/useDeckImportFlow';
import { DeckDialogFrame } from './DeckDialogFrame';

const SECONDARY_BUTTON_CLASS =
  'px-3 py-2 rounded-md text-sm font-medium text-text-secondary hover:text-text-primary '
  + 'hover:bg-bg-elevated transition-colors';
const PRIMARY_BUTTON_CLASS =
  'px-4 py-2 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-60 '
  + 'disabled:cursor-not-allowed text-white font-semibold text-sm shadow-glow '
  + 'transition-colors flex items-center gap-2';

export interface ImportDeckDialogProps {
  open: boolean;
  onClose: () => void;
  /** Receives the `.cod` XML to upload as a new deck. */
  onImport: (xml: string, colorIdentity: string) => void;
}

/**
 * Two-path importer: paste a list (Moxfield, Arena, MTGO, Cockatrice…)
 * → look the cards up → review matched / unknown → import; or upload a
 * `.cod` file, which skips the review and keeps its metadata.
 */
export function ImportDeckDialog({ open, onClose, onImport }: ImportDeckDialogProps) {
  const { t } = useTranslation();
  const flow = useDeckImportFlow(open, onImport);
  const titleId = useId();

  if (!open) {
    return null;
  }

  return (
    <DeckDialogFrame onClose={onClose} titleId={titleId}>
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
          aria-label={t('Common.action.close')}
        >
          <X size={18} />
        </button>

        <h2 id={titleId} className="font-modern text-xl font-semibold text-text-primary">{t('ImportDeckDialog.title')}</h2>
        <p className="text-sm text-text-muted mt-1">
          {t('ImportDeckDialog.subtitle')}
        </p>

        <div data-dialog-content className="contents">
          {flow.error && (
            <div className="mt-4 flex items-start gap-2 text-sm text-danger bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              <CircleAlert size={14} className="shrink-0 mt-0.5" />
              <span>{flow.error}</span>
            </div>
          )}

          {flow.phase === 'input' && <ImportInputStep flow={flow} />}

          {flow.phase === 'resolving' && <ImportProgress label={t('ImportDeckDialog.resolving')} />}

          {flow.phase === 'review' && <ImportReviewStep flow={flow} />}

          {flow.phase === 'importing' && <ImportProgress label={t('ImportDeckDialog.importing')} />}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLASS}>
            {t('Common.action.cancel')}
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
                title={t('ImportDeckDialog.importFileHint')}
              >
                <Upload size={14} /> {t('ImportDeckDialog.importFile')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void flow.resolve()}
                disabled={!flow.text.trim()}
                className={PRIMARY_BUTTON_CLASS}
              >
                {t('ImportDeckDialog.next')}
              </button>
            )
          )}
          {flow.phase === 'review' && (
            <>
              <button type="button" onClick={flow.backToInput} className={SECONDARY_BUTTON_CLASS}>
                {t('Common.action.back')}
              </button>
              <button
                type="button"
                onClick={flow.confirmPaste}
                disabled={flow.resolved.length === 0}
                className={PRIMARY_BUTTON_CLASS}
              >
                <Upload size={14} /> {t('ImportDeckDialog.importCards', { count: flow.resolved.length })}
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
  const { t } = useTranslation();
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
            {t('ImportDeckDialog.deckName')}
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
            {t('ImportDeckDialog.format')}
          </span>
          <FormatPicker value={flow.format} onChange={flow.setFormat} variant="dialog" />
        </div>
      </div>
      {!flow.file && <DeckLinkHandoff />}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {t('ImportDeckDialog.decklist')}
          </span>
          {flow.file ? (
            <button
              type="button"
              onClick={flow.clearFile}
              className="text-xs text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-1"
            >
              <X size={11} /> {t('ImportDeckDialog.clearFile')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => flow.fileInputRef.current?.click()}
              className="text-xs text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1"
              title={t('ImportDeckDialog.uploadFileHint')}
            >
              <Upload size={11} /> {t('ImportDeckDialog.uploadFile')}
            </button>
          )}
        </div>
        {flow.file ? (
          <ImportedFileSummary fileName={flow.file.name} parsed={flow.file.deck} />
        ) : (
          <textarea
            value={flow.text}
            onChange={(e) => flow.setText(e.target.value)}
            placeholder={t('ImportDeckDialog.placeholder')}
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
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 size={14} /> {t('ImportDeckDialog.review.matched', { count: flow.matchedCount })}
        </span>
        {flow.missingCount > 0 && (
          <span className="inline-flex items-center gap-1 text-warning">
            <CircleAlert size={14} /> {t('ImportDeckDialog.review.missing', { count: flow.missingCount })}
          </span>
        )}
        {flow.ignored.length > 0 && (
          <span className="text-text-muted">
            · {t('ImportDeckDialog.review.ignored', { count: flow.ignored.length })}
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
                <span className="text-xs text-warning">{t('ImportDeckDialog.review.unknown')}</span>
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
  const { t } = useTranslation();
  const { total: totalCount, main, sideboard } = summarizeUploadedDeck(parsed);
  const parts: string[] = [];
  if (main) {
    parts.push(t('ImportDeckDialog.file.main', { count: main }));
  }
  if (sideboard) {
    parts.push(t('ImportDeckDialog.file.sideboard', { count: sideboard }));
  }

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
        <Trans
          i18nKey="ImportDeckDialog.file.deckName"
          values={{ name: parsed.name }}
          components={{ name: <span className="text-text-secondary" /> }}
        />
      </div>
      <div className="text-xs text-text-muted mt-3 tabular-nums">
        {t('ImportDeckDialog.file.cards', { count: totalCount })}
        {parts.length > 0 && <> · {parts.join(' · ')}</>}
      </div>
      {parsed.meta.priceUsd != null && (
        <div className="text-xs text-success mt-1 tabular-nums font-medium">
          {t('ImportDeckDialog.file.cachedPrice', { price: parsed.meta.priceUsd.toFixed(2) })}
        </div>
      )}
      <div className="text-xs text-text-muted italic mt-4 max-w-sm">
        {t('ImportDeckDialog.file.hint')}
      </div>
    </div>
  );
}
