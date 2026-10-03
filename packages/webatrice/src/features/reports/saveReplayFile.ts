/**
 * Saves a replay fetched for a report as a Cockatrice replay file. The bytes
 * are the serialized GameReplay desktop parses before opening a replay tab,
 * which is also exactly what a `.cor` file holds, so the file opens in the
 * desktop client. Webatrice has no replay viewer yet; once it has, the queue's
 * replay action should open the bytes there instead of calling this.
 */
export function saveReplayFile(gameId: number, replayData: Uint8Array): void {
  const blob = new Blob([replayData as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-game-${gameId}.cor`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
