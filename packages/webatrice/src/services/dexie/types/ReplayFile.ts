export const REPLAY_LIBRARY_ROOT = 0;

export type ReplayFileKind = 'folder' | 'replay';

export class ReplayFile {
  id?: number;
  parentId: number;
  kind: ReplayFileKind;
  name: string;
  size: number;
  modifiedAt: string;
}

export class ReplayData {
  id: number;
  data: Uint8Array;
}
