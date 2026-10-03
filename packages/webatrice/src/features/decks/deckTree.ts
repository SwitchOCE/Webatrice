import type { ServerInfo_DeckStorage_Folder } from '@cockatrice/sockatrice/generated';

/**
 * A deck file from the Servatrice deck-storage tree, with the path of the
 * folder it sits in (see `deckFolders` for the folders themselves).
 */
export interface FlatDeck {
  id: number;
  name: string;
  /** Folder path from root, `""` for root-level decks. */
  path: string;
  /** Unix seconds. Not `updated_at` — Servatrice only tracks creation. */
  creationTime: number;
}

/**
 * Recursively walk a Servatrice folder tree collecting only files (leaf
 * decks). `pathPrefix` is the display path from the root.
 */
export function flattenFolder(folder: ServerInfo_DeckStorage_Folder, pathPrefix: string): FlatDeck[] {
  const out: FlatDeck[] = [];
  for (const item of folder.items) {
    if (item.file && item.id) {
      out.push({
        id: item.id,
        name: item.name || `Deck #${item.id}`,
        path: pathPrefix,
        creationTime: item.file.creationTime ?? 0,
      });
    } else if (item.folder) {
      const nextPath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
      out.push(...flattenFolder(item.folder, nextPath));
    }
  }
  return out;
}

/**
 * Loose "3 hours ago" formatter for Unix seconds. Good enough for the
 * list view; the editor can show absolute timestamps.
 */
export function formatDeckAge(unixSeconds: number, now = Date.now()): string {
  if (!unixSeconds) {
    return 'unknown';
  }
  const then = new Date(unixSeconds * 1000);
  const diffSec = (now - then.getTime()) / 1000;
  if (diffSec < 60) {
    return 'just now';
  }
  if (diffSec < 3600) {
    return `${Math.floor(diffSec / 60)}m ago`;
  }
  if (diffSec < 86400) {
    return `${Math.floor(diffSec / 3600)}h ago`;
  }
  if (diffSec < 604800) {
    return `${Math.floor(diffSec / 86400)}d ago`;
  }
  return then.toLocaleDateString();
}
