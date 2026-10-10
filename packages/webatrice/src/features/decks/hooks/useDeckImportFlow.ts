import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { parseCod } from '@app/services';
import type { ParsedDeck } from '@app/types';

import {
  buildPastedDeckCod,
  buildUploadedDeckCod,
  countResolvedRows,
  resolveImportEntries,
  resolvedImportColorIdentity,
  type ResolvedImportRow,
} from '../deckImport';
import { parseDecklist } from '../decklistParser';

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
  resolved: ResolvedImportRow[];
  ignored: string[];
  matchedCount: number;
  missingCount: number;
  file: { name: string; deck: ParsedDeck } | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  pickFile: (file: File | null) => void;
  clearFile: () => void;
  resolve: () => Promise<void>;
  backToInput: () => void;
  confirmPaste: () => void;
  confirmFile: () => Promise<void>;
}

export function useDeckImportFlow(open: boolean, onImport: (xml: string, colorIdentity: string) => void): DeckImportFlow {
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
        if (!name.trim()) {
          setName(parsed.name);
        }
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
    onImport(buildPastedDeckCod(resolved, name, format, t), resolvedImportColorIdentity(resolved));
  };

  const confirmFile = async () => {
    if (!file) {
      return;
    }
    setError(null);
    setPhase('importing');
    try {
      const rows = await resolveImportEntries(file.deck.cards);
      onImport(buildUploadedDeckCod(file.deck, name, format, t), resolvedImportColorIdentity(rows));
    } catch (e) {
      setPhase('input');
      setError(e instanceof Error ? e.message : t('ImportDeckDialog.resolveFailed'));
    }
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
