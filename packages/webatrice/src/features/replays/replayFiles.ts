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

/** Reads a user-picked file into bytes. */
export async function readReplayFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
