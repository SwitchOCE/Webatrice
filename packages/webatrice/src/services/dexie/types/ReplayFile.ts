/** Parent id of entries at the top of the local replay library. */
export const REPLAY_LIBRARY_ROOT = 0;

export type ReplayFileKind = 'folder' | 'replay';

/**
 * One entry of the local replay library, the browser analogue of desktop's
 * local replay directory: a tree of folders and `.cor` files addressed by
 * `parentId`. The replay bytes live in a separate table so listing a folder
 * never loads them.
 */
export class ReplayFile {
  id?: number;
  parentId: number;
  kind: ReplayFileKind;
  name: string;
  /** Byte length of a replay; 0 for folders. */
  size: number;
  modifiedAt: string;
}

export class ReplayData {
  id: number;
  data: Uint8Array;
}
