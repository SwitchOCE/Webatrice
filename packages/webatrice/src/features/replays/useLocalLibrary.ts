import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWatchReplay } from '@app/hooks';
import { REPLAY_LIBRARY_ROOT, ReplayFileDTO, ReplayNameTakenError, parseReplay } from '@app/services';

import { MAX_REPLAY_FILE_BYTES, hasReplayExtension, readReplayFile, saveReplayFile } from './replayFiles';
import type { ReplayNotice } from './useServerReplays';

export interface LocalLibrary {
  entries: ReplayFileDTO[];
  loading: boolean;
  reload: () => void;
  readEntry: (entryId: number) => Promise<Uint8Array>;
  watchFile: (file: File) => void;
  importFiles: (files: readonly File[]) => void;
  exportEntry: (entryId: number) => void;
  requestDelete: (entryId: number) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  deleteConfirmOpen: boolean;
  notice: ReplayNotice | null;
  dismissNotice: () => void;
}

export function useLocalLibrary(refreshKey = 0): LocalLibrary {
  const { t } = useTranslation();
  const watchReplay = useWatchReplay();
  const [entries, setEntries] = useState<ReplayFileDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [notice, setNotice] = useState<ReplayNotice | null>(null);
  const [reloads, setReloads] = useState(0);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const showError = useCallback((message: string) => {
    setNotice({ title: t('Replays.notice.error'), message, severity: 'error' });
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ReplayFileDTO.getAll()
      .then((all) => {
        if (!cancelled) {
          setEntries(all);
        }
      })
      .catch(() => {
        if (!cancelled) {
          showError(t('Replays.local.loadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloads, refreshKey, showError, t]);

  const readEntry = useCallback(async (entryId: number) => {
    let data: Uint8Array | undefined;
    try {
      data = await ReplayFileDTO.readData(entryId);
    } catch {
      throw new Error(t('Replays.local.readFailed'));
    }
    if (!data) {
      throw new Error(t('Replays.local.missingData'));
    }
    return data;
  }, [t]);

  const watchFile = useCallback((file: File) => {
    if (!hasReplayExtension(file)) {
      showError(t('Replays.local.invalidFile', { name: file.name }));
      return;
    }
    if (file.size > MAX_REPLAY_FILE_BYTES) {
      showError(t('Replays.local.tooLarge', { names: file.name }));
      return;
    }
    readReplayFile(file)
      .then((data) => watchReplay(data, file.name))
      .catch(() => showError(t('Replays.local.invalidFile', { name: file.name })));
  }, [watchReplay, showError, t]);

  const importFiles = useCallback((files: readonly File[]) => {
    const rejected: string[] = [];
    const tooLarge: string[] = [];
    const failed: string[] = [];
    const imports = files.map(async (file) => {
      if (file.size > MAX_REPLAY_FILE_BYTES) {
        tooLarge.push(file.name);
        return;
      }
      let data: Uint8Array;
      try {
        if (!hasReplayExtension(file)) {
          throw new Error('not a .cor file');
        }
        data = await readReplayFile(file);
        parseReplay(data);
      } catch {
        rejected.push(file.name);
        return;
      }
      try {
        await ReplayFileDTO.addReplay(REPLAY_LIBRARY_ROOT, file.name, data);
      } catch (err) {
        failed.push(err instanceof ReplayNameTakenError ? t('Replays.local.nameTaken', { name: file.name }) : file.name);
      }
    });
    void Promise.allSettled(imports).then(() => {
      const problems = [
        rejected.length ? t('Replays.local.invalidFiles', { names: rejected.join(', ') }) : null,
        tooLarge.length ? t('Replays.local.tooLarge', { names: tooLarge.join(', ') }) : null,
        failed.length ? t('Replays.local.importFailed', { names: failed.join(', ') }) : null,
      ].filter((problem): problem is string => problem != null);
      if (problems.length) {
        showError(problems.join(' '));
      }
      reload();
    });
  }, [reload, showError, t]);

  const exportEntry = useCallback((entryId: number) => {
    const name = entries.find((e) => e.id === entryId)?.name ?? `replay_${entryId}`;
    readEntry(entryId).then(
      (data) => saveReplayFile(data, name),
      (err: Error) => showError(err.message),
    );
  }, [entries, readEntry, showError]);

  const confirmDelete = useCallback(() => {
    const entryId = pendingDelete;
    setPendingDelete(null);
    if (entryId == null) {
      return;
    }
    ReplayFileDTO.delete([entryId])
      .catch(() => showError(t('Replays.local.deleteFailed')))
      .finally(reload);
  }, [pendingDelete, reload, showError, t]);

  return {
    entries,
    loading,
    reload,
    readEntry,
    watchFile,
    importFiles,
    exportEntry,
    requestDelete: setPendingDelete,
    confirmDelete,
    cancelDelete: () => setPendingDelete(null),
    deleteConfirmOpen: pendingDelete != null,
    notice,
    dismissNotice: () => setNotice(null),
  };
}
