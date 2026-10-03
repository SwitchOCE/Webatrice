/**
 * Hands `data` to the browser as a file download named `fileName`: the
 * blob → object URL → anchor click → revoke sequence a web page uses in place
 * of desktop's save-file dialog.
 */
export function downloadBlob(data: BlobPart, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
