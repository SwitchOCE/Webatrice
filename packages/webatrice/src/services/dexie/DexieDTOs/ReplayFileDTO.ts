import { dexieService } from '../DexieService';
import { REPLAY_LIBRARY_ROOT, ReplayFile, type ReplayData } from '../types/ReplayFile';

export class ReplayNameTakenError extends Error {
  constructor(name: string) {
    super(`An entry named "${name}" already exists in this folder.`);
    this.name = 'ReplayNameTakenError';
  }
}

function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

/** `name`, or `name (2)`, `name (3)`… keeping a file's extension last. */
function uniqueName(name: string, taken: readonly string[]): string {
  if (!taken.some((t) => sameName(t, name))) {
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.some((t) => sameName(t, candidate))) {
      return candidate;
    }
  }
}

/**
 * The local replay library, a folder tree in IndexedDB standing in for
 * desktop's local replay directory (TabReplays' QFileSystemModel pane).
 */
export class ReplayFileDTO extends ReplayFile {
  static listFolder(parentId: number = REPLAY_LIBRARY_ROOT): Promise<ReplayFileDTO[]> {
    return dexieService.replays.where('parentId').equals(parentId).toArray();
  }

  static get(id: number): Promise<ReplayFileDTO | undefined> {
    return dexieService.replays.get(id);
  }

  static getAll(): Promise<ReplayFileDTO[]> {
    return dexieService.replays.toArray();
  }

  static async readData(id: number): Promise<Uint8Array | undefined> {
    const row: ReplayData | undefined = await dexieService.replayData.get(id);
    return row?.data;
  }

  /** Stores a replay in `parentId`, renaming it `name (2)…` if the name is taken. */
  static addReplay(parentId: number, name: string, data: Uint8Array): Promise<number> {
    return dexieService.readWrite([dexieService.replays, dexieService.replayData], async () => {
      const siblings = await ReplayFileDTO.listFolder(parentId);
      const entry: ReplayFile = {
        parentId,
        kind: 'replay',
        name: uniqueName(name, siblings.map((s) => s.name)),
        size: data.byteLength,
        modifiedAt: new Date().toISOString(),
      };
      const id = (await dexieService.replays.add(entry)) as number;
      await dexieService.replayData.put({ id, data });
      return id;
    });
  }

  static addFolder(parentId: number, name: string): Promise<number> {
    return dexieService.readWrite([dexieService.replays], async () => {
      await ReplayFileDTO.assertNameFree(parentId, name);
      const entry: ReplayFile = {
        parentId,
        kind: 'folder',
        name,
        size: 0,
        modifiedAt: new Date().toISOString(),
      };
      return (await dexieService.replays.add(entry)) as number;
    });
  }

  /** Renames an entry; like a file system, a sibling may not already hold the name. */
  static rename(id: number, name: string): Promise<void> {
    return dexieService.readWrite([dexieService.replays], async () => {
      const entry = await ReplayFileDTO.get(id);
      if (!entry) {
        return;
      }
      await ReplayFileDTO.assertNameFree(entry.parentId, name, id);
      await dexieService.replays.update(id, { name, modifiedAt: new Date().toISOString() });
    });
  }

  /** Deletes entries; a folder takes everything beneath it along. */
  static delete(ids: readonly number[]): Promise<void> {
    return dexieService.readWrite([dexieService.replays, dexieService.replayData], async () => {
      const all = await ReplayFileDTO.getAll();
      const doomed = new Set<number>();
      const collect = (id: number) => {
        doomed.add(id);
        for (const child of all) {
          if (child.parentId === id && child.id != null && !doomed.has(child.id)) {
            collect(child.id);
          }
        }
      };
      ids.forEach(collect);
      const keys = [...doomed];
      await dexieService.replays.bulkDelete(keys);
      await dexieService.replayData.bulkDelete(keys);
    });
  }

  private static async assertNameFree(parentId: number, name: string, exceptId?: number): Promise<void> {
    const siblings = await ReplayFileDTO.listFolder(parentId);
    if (siblings.some((s) => s.id !== exceptId && sameName(s.name, name))) {
      throw new ReplayNameTakenError(name);
    }
  }
}

dexieService.replays.mapToClass(ReplayFileDTO);
