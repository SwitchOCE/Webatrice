import type { ServerInfo_DeckStorage_Folder } from '@cockatrice/sockatrice/generated';

export interface FlatDeck {
  id: number;
  name: string;
  /** Folder path from root, `""` for root-level decks. */
  path: string;
  /** Unix seconds. Not `updated_at` — Servatrice only tracks creation. */
  creationTime: number;
}

/** Recursively walk a Servatrice folder tree collecting only files
 *  (leaf decks). `pathPrefix` is the display path from the root. */
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
