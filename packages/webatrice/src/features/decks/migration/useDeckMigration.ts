import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_DeckStorage_TreeItem } from '@cockatrice/sockatrice/generated';
import { ServerInfo_User_UserLevelFlag } from '@cockatrice/sockatrice/generated';
import { useReduxEffect } from '@app/hooks';
import { importCustomSetFiles, importReplayFiles, type CardSourceImportSummary, type ImportSummary } from '@app/services';
import { useAppSelector } from '@app/store';

import {
  buildImportedDeckCod,
  lookupImportEntries,
  resolvedImportColorIdentity,
  resolveWithLookups,
  type ImportLookups,
} from '../deckImport';
import { extraZoneSummary } from '../deckFiles';
import type { SourceFile } from './fileSources';
import {
  classifySources,
  conflictsWithServer,
  DEFAULT_DESTINATION,
  existingNameIndex,
  planDeckImport,
  scanDeckSource,
  type ClassifiedSources,
  type ConflictChoice,
  type DeckScanProblem,
  type PlannedFolder,
  type PlannedUpload,
  type ScannedDeck,
} from './migrationPlan';
import { runPaced, SERVER_PACING, type TaskOutcome } from './pacedQueue';

const RESPONSE_CHAT_FLOOD = 18;
const UPLOAD_TIMEOUT_MS = 20_000;
const FOLDER_TIMEOUT_MS = 8_000;

export type MigrationStage = 'source' | 'scanning' | 'preview' | 'importing' | 'done';

export interface DeckPreview {
  id: string;
  name: string;
  fileName: string;
  folder: string[];
  cardCount: number;
  format: string;
  unknownCount: number;
  extraZones: Array<{ zone: string; count: number }>;
  onServer: boolean;
  problem?: DeckScanProblem;
}

export type DeckFailure = 'flood' | 'server' | 'timeout';

export interface DeckMigrationResult {
  imported: Array<{ id: string; deckId?: number; name: string; path: string; renamedFrom?: string; unknownCount: number }>;
  skipped: Array<{ name: string; reason: 'exists' | 'pathTooLong' | DeckScanProblem }>;
  failed: Array<{ name: string; reason: DeckFailure; code?: number }>;
  notStarted: number;
  stopped?: 'disconnected' | 'cancelled';
}

export interface MigrationResult {
  decks: DeckMigrationResult | null;
  replays: ImportSummary | null;
  customSets: CardSourceImportSummary | null;
}

interface PendingResponse {
  resolve: (outcome: { ok: boolean; code?: number; deckId?: number }) => void;
  timer: ReturnType<typeof setTimeout>;
}

function deckPreview(scanned: ScannedDeck, lookups: ImportLookups | null, onServer: boolean): DeckPreview {
  const deck = scanned.deck;
  const rows = deck && lookups ? resolveWithLookups(deck.cards, lookups) : [];
  return {
    id: scanned.id,
    name: deck?.name ?? scanned.fileName,
    fileName: scanned.fileName,
    folder: scanned.folder,
    cardCount: deck?.cards.reduce((sum, c) => sum + c.quantity, 0) ?? 0,
    format: deck?.format ?? '',
    unknownCount: rows.filter((r) => !r.lookup.found).reduce((sum, r) => sum + r.entry.quantity, 0),
    extraZones: extraZoneSummary(deck?.extraZonesXml),
    onServer,
    ...(scanned.problem ? { problem: scanned.problem } : {}),
  };
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function useDeckMigration() {
  const { t } = useTranslation();
  const webClient = useWebClient();
  const root = useAppSelector(server.Selectors.getBackendDecks)?.root;
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const userLevel = useAppSelector(server.Selectors.getUser)?.userLevel ?? 0;
  const canStoreDecks = isConnected && (userLevel & ServerInfo_User_UserLevelFlag.IsRegistered) !== 0;

  const [stage, setStage] = useState<MigrationStage>('source');
  const [sources, setSources] = useState<ClassifiedSources | null>(null);
  const [scanned, setScanned] = useState<ScannedDeck[]>([]);
  const [lookups, setLookups] = useState<ImportLookups | null>(null);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0, checkingCards: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState(DEFAULT_DESTINATION);
  const [choice, setChoice] = useState<ConflictChoice>('skip');
  const [includeReplays, setIncludeReplays] = useState(true);
  const [includeCustomSets, setIncludeCustomSets] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '', creatingFolder: false });
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useRef(0);
  const cancelled = useRef(false);
  const connectedRef = useRef(isConnected);
  useEffect(() => {
    connectedRef.current = isConnected;
  }, [isConnected]);
  const uploads = useRef(new Map<string, PendingResponse>());
  const folders = useRef(new Map<string, PendingResponse>());
  const requestSeq = useRef(0);

  useEffect(() => () => {
    run.current += 1;
    cancelled.current = true;
    for (const pending of [...uploads.current.values(), ...folders.current.values()]) {
      clearTimeout(pending.timer);
    }
  }, []);

  const settle = (map: Map<string, PendingResponse>, key: string | undefined, outcome: { ok: boolean; code?: number; deckId?: number }) => {
    const pending = key === undefined ? undefined : map.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      map.delete(key!);
      pending.resolve(outcome);
    }
  };

  useReduxEffect<{ path: string; treeItem: ServerInfo_DeckStorage_TreeItem; requestId?: string }>(({ payload }) => {
    settle(uploads.current, payload.requestId, { ok: true, deckId: payload.treeItem.id });
  }, server.Types.DECK_UPLOAD, []);

  useReduxEffect<{ responseCode: number; requestId?: string }>(({ payload }) => {
    settle(uploads.current, payload.requestId, { ok: false, code: payload.responseCode });
  }, server.Types.DECK_UPLOAD_FAILED, []);

  useReduxEffect<{ path: string; dirName: string }>(({ payload }) => {
    settle(folders.current, JSON.stringify([payload.path, payload.dirName]), { ok: true });
  }, server.Types.DECK_NEW_DIR, []);

  const awaitResponse = (map: Map<string, PendingResponse>, key: string, timeoutMs: number) =>
    new Promise<{ ok: boolean; code?: number; deckId?: number }>((resolve) => {
      const timer = setTimeout(() => {
        map.delete(key);
        resolve({ ok: false });
      }, timeoutMs);
      map.set(key, { resolve, timer });
    });

  const reset = useCallback(() => {
    run.current += 1;
    setStage('source');
    setSources(null);
    setScanned([]);
    setLookups(null);
    setSelected(new Set());
    setResult(null);
    setError(null);
  }, []);

  const addSources = useCallback(async (files: SourceFile[]) => {
    const current = ++run.current;
    setError(null);
    const classified = classifySources(files);
    if (!classified.decks.length && !classified.replays.length && !classified.customSets.length) {
      setError(t('DeckMigration.error.nothingFound'));
      return;
    }
    setSources(classified);
    setStage('scanning');
    setScanProgress({ done: 0, total: classified.decks.length, checkingCards: false });
    const out: ScannedDeck[] = [];
    for (let i = 0; i < classified.decks.length; i++) {
      out.push(await scanDeckSource(classified.decks[i], `deck-${i}`));
      if (i % 10 === 9) {
        if (current !== run.current) {
          return;
        }
        setScanProgress({ done: i + 1, total: classified.decks.length, checkingCards: false });
        await yieldToBrowser();
      }
    }
    if (current !== run.current) {
      return;
    }
    setScanned(out);
    setScanProgress({ done: out.length, total: out.length, checkingCards: true });
    let found: ImportLookups | null = null;
    const entries = out.flatMap((s) => s.deck?.cards ?? []);
    if (entries.length) {
      try {
        found = await lookupImportEntries(entries);
      } catch {
        found = null;
      }
    }
    if (current !== run.current) {
      return;
    }
    setLookups(found);
    setSelected(new Set(out.filter((s) => s.deck).map((s) => s.id)));
    setStage('preview');
  }, [t]);

  const previews = useMemo(() => {
    const index = existingNameIndex(root);
    return scanned.map((s) => deckPreview(s, lookups, conflictsWithServer(s, destination.trim(), index)));
  }, [scanned, lookups, root, destination]);

  const plan = useMemo(
    () => planDeckImport(scanned, root, { destination: destination.trim(), choice, selected }),
    [scanned, root, destination, choice, selected],
  );

  const toggle = useCallback((ids: readonly string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }, []);

  const runDecks = async (current: number): Promise<DeckMigrationResult> => {
    const byId = new Map(scanned.map((s) => [s.id, s]));
    const previewById = new Map(previews.map((p) => [p.id, p]));
    const outcome: DeckMigrationResult = { imported: [], skipped: [], failed: [], notStarted: 0 };
    for (const s of scanned) {
      if (s.problem && selected.has(s.id)) {
        outcome.skipped.push({ name: s.fileName, reason: s.problem });
      }
    }
    for (const skip of plan.skipped) {
      outcome.skipped.push({ name: byId.get(skip.id)?.deck?.name ?? '', reason: skip.reason });
    }

    type Step = { kind: 'folder'; folder: PlannedFolder } | { kind: 'upload'; upload: PlannedUpload };
    const steps: Step[] = [
      ...plan.folders.map((folder) => ({ kind: 'folder' as const, folder })),
      ...plan.uploads.map((upload) => ({ kind: 'upload' as const, upload })),
    ];
    const failures = new Map<number, { reason: DeckFailure; code?: number }>();
    setProgress({ done: 0, total: plan.uploads.length, current: '', creatingFolder: false });
    let uploaded = 0;

    const task = async (step: Step, index: number): Promise<TaskOutcome> => {
      if (current !== run.current || !connectedRef.current) {
        return 'stop';
      }
      if (step.kind === 'folder') {
        setProgress((p) => ({ ...p, current: [step.folder.parent, step.folder.name].filter(Boolean).join('/'), creatingFolder: true }));
        const key = JSON.stringify([step.folder.parent, step.folder.name]);
        const response = awaitResponse(folders.current, key, FOLDER_TIMEOUT_MS);
        webClient.request.session.deckNewDir(step.folder.parent, step.folder.name);
        await response;
        return 'ok';
      }
      const scannedDeck = byId.get(step.upload.id)!;
      const deck = scannedDeck.deck!;
      setProgress({ done: uploaded, total: plan.uploads.length, current: step.upload.name, creatingFolder: false });
      const rows = resolveWithLookups(deck.cards, lookups ?? { hinted: new Map(), byName: new Map() });
      const xml = buildImportedDeckCod(deck, rows, { name: step.upload.name, format: deck.format, t });
      const requestId = `deck-migration-${++requestSeq.current}`;
      const response = awaitResponse(uploads.current, requestId, UPLOAD_TIMEOUT_MS);
      webClient.request.session.deckUpload(step.upload.path, 0, xml, undefined, resolvedImportColorIdentity(rows) || undefined, requestId);
      const answer = await response;
      if (answer.ok) {
        failures.delete(index);
        outcome.imported.push({
          id: step.upload.id,
          deckId: answer.deckId,
          name: step.upload.name,
          path: step.upload.path,
          unknownCount: previewById.get(step.upload.id)?.unknownCount ?? 0,
          ...(step.upload.renamedFrom ? { renamedFrom: step.upload.renamedFrom } : {}),
        });
        return 'ok';
      }
      if (answer.code === RESPONSE_CHAT_FLOOD) {
        failures.set(index, { reason: 'flood', code: answer.code });
        return 'flood';
      }
      failures.set(index, answer.code === undefined ? { reason: 'timeout' } : { reason: 'server', code: answer.code });
      return 'failed';
    };

    const settled = (step: Step, index: number) => {
      if (step.kind !== 'upload') {
        return;
      }
      uploaded += 1;
      const failure = failures.get(index);
      if (failure) {
        outcome.failed.push({ name: step.upload.name, ...failure });
      }
      setProgress({ done: uploaded, total: plan.uploads.length, current: '', creatingFolder: false });
    };

    const ran = await runPaced(steps, task, settled, { ...SERVER_PACING, isCancelled: () => cancelled.current });
    if (ran.stopped) {
      outcome.notStarted = steps.slice(ran.completed).filter((s) => s.kind === 'upload').length;
      outcome.stopped = connectedRef.current ? 'cancelled' : 'disconnected';
    }
    return outcome;
  };

  const start = async () => {
    if (!sources) {
      return;
    }
    const current = ++run.current;
    cancelled.current = false;
    setStage('importing');
    setError(null);
    const paths = new Map([...sources.replays, ...sources.customSets].map((s) => [s.file, s.path]));
    const relativePathOf = (file: File) => paths.get(file) ?? file.name;
    const replays = includeReplays && sources.replays.length
      ? await importReplayFiles(sources.replays.map((s) => s.file), { relativePathOf })
      : null;
    const customSets = includeCustomSets && sources.customSets.length
      ? await importCustomSetFiles(sources.customSets.map((s) => s.file), { relativePathOf })
      : null;
    const decks = canStoreDecks && plan.uploads.length + plan.skipped.length + scanned.filter((s) => s.problem).length > 0
      ? await runDecks(current)
      : null;
    if (current !== run.current) {
      return;
    }
    setResult({ decks, replays, customSets });
    setStage('done');
  };

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  return {
    stage,
    error,
    canStoreDecks,
    isConnected,
    sources,
    previews,
    scanProgress,
    selected,
    toggle,
    destination,
    setDestination,
    choice,
    setChoice,
    includeReplays,
    setIncludeReplays,
    includeCustomSets,
    setIncludeCustomSets,
    plan,
    progress,
    result,
    addSources,
    start,
    cancel,
    reset,
  };
}

export type DeckMigration = ReturnType<typeof useDeckMigration>;
