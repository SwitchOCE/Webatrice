import { REPLAY_FILE_EXTENSION } from '@app/services';

/** Hands replay bytes to the browser as a `.cor` download. */
export function saveReplayFile(data: Uint8Array, fileName: string): void {
  const blob = new Blob([data as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.toLowerCase().endsWith(REPLAY_FILE_EXTENSION) ? fileName : `${fileName}${REPLAY_FILE_EXTENSION}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Largest file accepted as a replay. Recorded games are well under a megabyte;
 * the cap only keeps a mis-picked huge file from being read into memory.
 */
export const MAX_REPLAY_FILE_BYTES = 32 * 1024 * 1024;

/** Desktop's REPLAY_FILE_NAME_FILTERS: only `*.cor` files are replays. */
export function hasReplayExtension(file: File): boolean {
  return file.name.toLowerCase().endsWith(REPLAY_FILE_EXTENSION);
}

/**
 * Splits a library entry name for renaming: desktop's rename dialog edits only
 * the base name and re-appends the suffix (TabReplays::actRenameLocal).
 */
export function splitReplayName(name: string): { base: string; extension: string } {
  const extension = name.toLowerCase().endsWith(REPLAY_FILE_EXTENSION) ? name.slice(-REPLAY_FILE_EXTENSION.length) : '';
  return { base: extension ? name.slice(0, -extension.length) : name, extension };
}

/** Reads a user-picked file into bytes. */
export async function readReplayFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
