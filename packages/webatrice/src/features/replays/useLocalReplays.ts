import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWatchReplay } from '@app/hooks';
import {
  REPLAY_LIBRARY_ROOT,
  ReplayFileDTO,
  ReplayNameTakenError,
  parseReplay,
} from '@app/services';

import { readReplayFile, saveReplayFile } from './replayFiles';
import type { ReplayNotice } from './useServerReplays';

export interface LibraryCrumb {
  id: number;
  name: string;
}

export type LocalPrompt =
  | { kind: 'newFolder' }
  | { kind: 'rename'; entry: ReplayFileDTO };

export interface LocalReplays {
  folderId: number;
  path: LibraryCrumb[];
  entries: ReplayFileDTO[];
  loading: boolean;
  selected: ReplayFileDTO | undefined;
  select: (id: number | null) => void;
  openFolder: (id: number) => void;
  activate: (entry: ReplayFileDTO) => void;
  watchSelected: () => void;
  watchFile: (file: File) => void;
  importFiles: (files: readonly File[]) => void;
  exportSelected: () => void;
  prompt: LocalPrompt | null;
  requestNewFolder: () => void;
  requestRename: () => void;
  submitPrompt: (name: string) => void;
  cancelPrompt: () => void;
  deleteConfirmOpen: boolean;
  requestDelete: () => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  notice: ReplayNotice | null;
  dismissNotice: () => void;
}

function byFolderThenName(a: ReplayFileDTO, b: ReplayFileDTO): number {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * The local replay library pane: desktop's local file system pane of
 * TabReplays (watch, rename, new folder, delete), backed by IndexedDB instead
 * of a replay directory. Picking a `.cor` either watches it straight away
 * (desktop's File > Watch replay) or imports it into the current folder.
 * `refreshKey` reloads the folder when something else adds to the library.
 */
export function useLocalReplays(refreshKey = 0): LocalReplays {
  const { t } = useTranslation();
  const watchReplay = useWatchReplay();
  const [folderId, setFolderId] = useState(REPLAY_LIBRARY_ROOT);
  const [entries, setEntries] = useState<ReplayFileDTO[]>([]);
  const [allFolders, setAllFolders] = useState<ReplayFileDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState<LocalPrompt | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<ReplayNotice | null>(null);
  const [reloads, setReloads] = useState(0);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const showError = useCallback((message: string) => {
    setNotice({ title: t('Replays.notice.error'), message, severity: 'error' });
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([ReplayFileDTO.listFolder(folderId), ReplayFileDTO.getAll()])
      .then(([children, all]) => {
        if (cancelled) {
          return;
        }
        setEntries([...children].sort(byFolderThenName));
        setAllFolders(all.filter((e) => e.kind === 'folder'));
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
  }, [folderId, reloads, refreshKey, showError, t]);

  const path = useMemo(() => {
    const crumbs: LibraryCrumb[] = [];
    const byId = new Map(allFolders.map((f) => [f.id, f]));
    for (let id = folderId; id !== REPLAY_LIBRARY_ROOT;) {
      const folder = byId.get(id);
      if (!folder) {
        break;
      }
      crumbs.unshift({ id, name: folder.name });
      id = folder.parentId;
    }
    return [{ id: REPLAY_LIBRARY_ROOT, name: t('Replays.local.root') }, ...crumbs];
  }, [allFolders, folderId, t]);

  const selected = entries.find((e) => e.id === selectedId);

  const openFolder = useCallback((id: number) => {
    setSelectedId(null);
    setFolderId(id);
  }, []);

  const watchEntry = useCallback(async (entry: ReplayFileDTO) => {
    if (entry.kind !== 'replay' || entry.id == null) {
      return;
    }
    const data = await ReplayFileDTO.readData(entry.id);
    if (!data) {
      showError(t('Replays.local.missingData'));
      return;
    }
    try {
      watchReplay(data, entry.name);
    } catch {
      showError(t('Replays.local.invalidFile', { name: entry.name }));
    }
  }, [watchReplay, showError, t]);

  // Desktop: double-clicking a folder expands it, a file opens the replay.
  const activate = useCallback((entry: ReplayFileDTO) => {
    if (entry.kind === 'folder' && entry.id != null) {
      openFolder(entry.id);
    } else {
      void watchEntry(entry);
    }
  }, [openFolder, watchEntry]);

  const watchSelected = useCallback(() => {
    if (selected) {
      void watchEntry(selected);
    }
  }, [selected, watchEntry]);

  const watchFile = useCallback((file: File) => {
    readReplayFile(file)
      .then((data) => watchReplay(data, file.name))
      .catch(() => showError(t('Replays.local.invalidFile', { name: file.name })));
  }, [watchReplay, showError, t]);

  const importFiles = useCallback((files: readonly File[]) => {
    const rejected: string[] = [];
    const imports = files.map(async (file) => {
      const data = await readReplayFile(file);
      try {
        parseReplay(data);
      } catch {
        rejected.push(file.name);
        return;
      }
      await ReplayFileDTO.addReplay(folderId, file.name, data);
    });
    Promise.all(imports)
      .then(() => {
        if (rejected.length) {
          showError(t('Replays.local.invalidFiles', { names: rejected.join(', ') }));
        }
      })
      .catch(() => showError(t('Replays.local.saveFailed')))
      .finally(reload);
  }, [folderId, reload, showError, t]);

  const exportSelected = useCallback(() => {
    if (selected?.kind !== 'replay' || selected.id == null) {
      return;
    }
    const { name } = selected;
    ReplayFileDTO.readData(selected.id).then((data) => {
      if (data) {
        saveReplayFile(data, name);
      } else {
        showError(t('Replays.local.missingData'));
      }
    });
  }, [selected, showError, t]);

  const submitPrompt = useCallback((rawName: string) => {
    const name = rawName.trim();
    const current = prompt;
    setPrompt(null);
    if (!current || !name) {
      return;
    }
    const action = current.kind === 'newFolder'
      ? ReplayFileDTO.addFolder(folderId, name)
      : ReplayFileDTO.rename(current.entry.id!, name);
    action
      .catch((err) => {
        if (err instanceof ReplayNameTakenError) {
          showError(t('Replays.local.nameTaken', { name }));
        } else {
          showError(current.kind === 'newFolder' ? t('Replays.local.newFolderFailed') : t('Replays.local.renameFailed'));
        }
      })
      .finally(reload);
  }, [prompt, folderId, reload, showError, t]);

  const confirmDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
    if (selected?.id == null) {
      return;
    }
    ReplayFileDTO.delete([selected.id])
      .then(() => setSelectedId(null))
      .catch(() => showError(t('Replays.local.deleteFailed')))
      .finally(reload);
  }, [selected, reload, showError, t]);

  return {
    folderId,
    path,
    entries,
    loading,
    selected,
    select: setSelectedId,
    openFolder,
    activate,
    watchSelected,
    watchFile,
    importFiles,
    exportSelected,
    prompt,
    requestNewFolder: () => setPrompt({ kind: 'newFolder' }),
    requestRename: () => {
      if (selected) {
        setPrompt({ kind: 'rename', entry: selected });
      }
    },
    submitPrompt,
    cancelPrompt: () => setPrompt(null),
    deleteConfirmOpen,
    requestDelete: () => {
      if (selected) {
        setDeleteConfirmOpen(true);
      }
    },
    confirmDelete,
    cancelDelete: () => setDeleteConfirmOpen(false),
    notice,
    dismissNotice: () => setNotice(null),
  };
}
