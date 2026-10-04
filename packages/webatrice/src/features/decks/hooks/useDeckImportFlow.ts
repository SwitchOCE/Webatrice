import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { parseCod } from '@app/services';
import type { ParsedDeck } from '@app/types';

import {
  buildPastedDeckCod,
  buildUploadedDeckCod,
  countResolvedRows,
  resolveImportEntries,
  type ResolvedImportRow,
} from '../deckImport';
import { parseDecklist } from '../decklistParser';

/** paste/upload → (resolving → review, pasted lists only) → importing */
export type ImportPhase = 'input' | 'resolving' | 'review' | 'importing';

export interface DeckImportFlow {
  phase: ImportPhase;
  name: string;
  setName: (name: string) => void;
  format: string;
  setFormat: (format: string) => void;
  text: string;
  setText: (text: string) => void;
  error: string | null;
  /** Pasted entries after lookup, in paste order. */
  resolved: ResolvedImportRow[];
  /** Lines the decklist parser couldn't read. */
  ignored: string[];
  matchedCount: number;
  missingCount: number;
  /** A parsed `.cod` upload; replaces the paste-and-review path. */
  file: { name: string; deck: ParsedDeck } | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  pickFile: (file: File | null) => void;
  clearFile: () => void;
  /** Look the pasted cards up and move to review. */
  resolve: () => Promise<void>;
  backToInput: () => void;
  /** Build the `.cod` for the reviewed paste and hand it to `onImport`. */
  confirmPaste: () => void;
  /** Build the `.cod` for the uploaded file and hand it to `onImport`. */
  confirmFile: () => void;
}

/**
 * State machine behind the import dialog. A pasted list is parsed,
 * resolved through the card catalog (Dexie first, Scryfall fallback) and
 * reviewed before upload; a `.cod` file skips the review and keeps its
 * embedded metadata. Every open starts fresh.
 */
export function useDeckImportFlow(open: boolean, onImport: (xml: string) => void): DeckImportFlow {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [format, setFormat] = useState('commander');
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<ImportPhase>('input');
  const [resolved, setResolved] = useState<ResolvedImportRow[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; deck: ParsedDeck } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Reset on open so a previous close mid-flow doesn't leak state.
  useEffect(() => {
    if (!open) {
      return;
    }
    setName('');
    setFormat('commander');
    setText('');
    setPhase('input');
    setResolved([]);
    setIgnored([]);
    setError(null);
    setFile(null);
    resetFileInput();
  }, [open]);

  const pickFile = (picked: File | null) => {
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const xml = typeof reader.result === 'string' ? reader.result : '';
      try {
        const parsed = parseCod(xml);
        setFile({ name: picked.name, deck: parsed });
        // Adopt the file's name only when nothing has been typed yet.
        if (!name.trim()) {
          setName(parsed.name);
        }
        // The file's own <format> is authoritative for its contents; the
        // picker can still change it afterwards.
        if (parsed.format) {
          setFormat(parsed.format);
        }
      } catch (e) {
        setFile(null);
        setError(
          e instanceof Error
            ? t('DeckImport.error.invalidCodReason', { reason: e.message })
            : t('DeckImport.error.invalidCod'),
        );
        resetFileInput();
      }
    };
    reader.onerror = () => {
      setError(t('DeckImport.error.readFailed'));
    };
    reader.readAsText(picked);
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
    resetFileInput();
  };

  const resolve = async () => {
    setError(null);
    const { entries, ignored: skipped } = parseDecklist(text);
    if (entries.length === 0) {
      setError(t('DeckImport.error.noCards'));
      return;
    }
    setPhase('resolving');
    try {
      setResolved(await resolveImportEntries(entries));
      setIgnored(skipped);
      setPhase('review');
    } catch (e) {
      setPhase('input');
      setError(e instanceof Error ? e.message : t('DeckImport.error.resolveFailed'));
    }
  };

  const confirmPaste = () => {
    setError(null);
    setPhase('importing');
    onImport(buildPastedDeckCod(resolved, name, format, t));
  };

  const confirmFile = () => {
    if (!file) {
      return;
    }
    setError(null);
    setPhase('importing');
    onImport(buildUploadedDeckCod(file.deck, name, format, t));
  };

  const { matched, missing } = countResolvedRows(resolved);

  return {
    phase,
    name,
    setName,
    format,
    setFormat,
    text,
    setText,
    error,
    resolved,
    ignored,
    matchedCount: matched,
    missingCount: missing,
    file,
    fileInputRef,
    pickFile,
    clearFile,
    resolve,
    backToInput: () => setPhase('input'),
    confirmPaste,
    confirmFile,
  };
}
