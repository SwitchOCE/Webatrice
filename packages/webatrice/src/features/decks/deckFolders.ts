import type { ServerInfo_DeckStorage_File, ServerInfo_DeckStorage_Folder } from '@cockatrice/sockatrice/generated';

import { deckVisibility, flattenFolder, type DeckVisibility, type FlatDeck } from './deckTree';

/**
 * Folders of Servatrice deck storage, as desktop's remote tree in
 * `TabDeckStorage` shows them. Paths are `/`-joined folder names from the
 * root; the root itself is `""`.
 */

/** Servatrice's `MAX_NAME_LENGTH`: a folder path, name included, fits in 255. */
export const MAX_DECK_PATH_LENGTH = 0xff;

export interface DeckFolderEntry {
  name: string;
  path: string;
  /** Decks in the folder and all its subfolders. */
  deckCount: number;
  /** Subfolders at any depth. */
  folderCount: number;
  visibility: DeckVisibility;
}

export interface DeckFolderView {
  /** The folder actually shown: the requested path, or the root when it doesn't exist. */
  path: string;
  /** Subfolders, by name. */
  folders: DeckFolderEntry[];
  /** Decks directly in the folder, newest first. */
  decks: FlatDeck[];
}

export function joinDeckPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function parentDeckPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/** Breadcrumbs below the root: each segment with its own path. */
export function deckPathCrumbs(path: string): { name: string; path: string }[] {
  if (!path) {
    return [];
  }
  const segments = path.split('/');
  return segments.map((name, i) => ({ name, path: segments.slice(0, i + 1).join('/') }));
}

/** Whether `path` or a folder above it is public, so what it holds inherits it. */
export function isUnderPublicFolder(root: ServerInfo_DeckStorage_Folder | undefined, path: string): boolean {
  if (!root) {
    return false;
  }
  let folder: ServerInfo_DeckStorage_Folder | undefined = root;
  if (folder.isPublic) {
    return true;
  }
  for (const segment of path ? path.split('/') : []) {
    folder = folder?.items.find((item) => item.folder && item.name === segment)?.folder;
    if (!folder) {
      return false;
    }
    if (folder.isPublic) {
      return true;
    }
  }
  return false;
}

/** The folder at `path`, or `undefined` when there is none. */
export function findDeckFolder(
  root: ServerInfo_DeckStorage_Folder | undefined,
  path: string,
): ServerInfo_DeckStorage_Folder | undefined {
  if (!root || !path) {
    return root;
  }
  let folder: ServerInfo_DeckStorage_Folder | undefined = root;
  for (const segment of path.split('/')) {
    folder = folder?.items.find((item) => item.folder && item.name === segment)?.folder;
    if (!folder) {
      return undefined;
    }
  }
  return folder;
}

function countFolders(folder: ServerInfo_DeckStorage_Folder): number {
  return folder.items.reduce((sum, item) => sum + (item.folder ? 1 + countFolders(item.folder) : 0), 0);
}

/** One level of the tree: what desktop's tree shows when a folder is expanded. */
export function listDeckFolder(root: ServerInfo_DeckStorage_Folder | undefined, path: string): DeckFolderView {
  const folder = findDeckFolder(root, path);
  const shownPath = folder ? path : '';
  const shown = folder ?? root;
  if (!shown) {
    return { path: '', folders: [], decks: [] };
  }
  const inherited = isUnderPublicFolder(root, shownPath);
  const folders: DeckFolderEntry[] = shown.items
    .filter((item) => item.folder)
    .map((item) => {
      const childPath = joinDeckPath(shownPath, item.name);
      return {
        name: item.name,
        path: childPath,
        deckCount: flattenFolder(item.folder!, childPath).length,
        folderCount: countFolders(item.folder!),
        visibility: deckVisibility(item.folder!.isPublic, inherited),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const decks = flattenFolder({ ...shown, items: shown.items.filter((item) => !item.folder) }, shownPath, inherited)
    .sort((a, b) => b.creationTime - a.creationTime);
  return { path: shownPath, folders, decks };
}

/** Every deck at or below `path` — the scope of a folder delete or download. */
export function decksUnderFolder(root: ServerInfo_DeckStorage_Folder | undefined, path: string): FlatDeck[] {
  const folder = findDeckFolder(root, path);
  return folder ? flattenFolder(folder, path, isUnderPublicFolder(root, parentDeckPath(path))) : [];
}

/** A deck in another user's public tree, with the preview metadata Servatrice keeps for it. */
export interface PublicDeckEntry {
  id: number;
  name: string;
  /** Folder path in the owner's storage. */
  path: string;
  file: ServerInfo_DeckStorage_File;
}

/** Every deck in a public deck tree (`Command_DeckListOtherUser`), folders flattened into paths. */
export function listPublicDecks(folder: ServerInfo_DeckStorage_Folder | undefined, path = ''): PublicDeckEntry[] {
  if (!folder) {
    return [];
  }
  return folder.items.flatMap((item) => {
    if (item.file && item.id) {
      return [{ id: item.id, name: item.name || `Deck #${item.id}`, path, file: item.file }];
    }
    return item.folder ? listPublicDecks(item.folder, joinDeckPath(path, item.name)) : [];
  });
}

/** Every folder path, root first, for picking where a deck goes. */
export function allDeckFolderPaths(root: ServerInfo_DeckStorage_Folder | undefined): string[] {
  const out = [''];
  const walk = (folder: ServerInfo_DeckStorage_Folder, path: string) => {
    for (const item of folder.items) {
      if (item.folder) {
        const childPath = joinDeckPath(path, item.name);
        out.push(childPath);
        walk(item.folder, childPath);
      }
    }
  };
  if (root) {
    walk(root, '');
  }
  return [out[0], ...out.slice(1).sort((a, b) => a.localeCompare(b))];
}

export type FolderNameProblem = 'empty' | 'tooLong' | 'exists';

/**
 * Desktop `TabDeckStorage::actNewFolder`: `/` can't be part of a name, so
 * it becomes `-`; the whole path must stay within the server's limit. A
 * name already used by a sibling folder is refused too — Servatrice would
 * store it, but the two folders would then share one path.
 */
export function checkNewFolderName(
  name: string,
  parentPath: string,
  siblings: readonly string[],
): { name: string } | { problem: FolderNameProblem } {
  const cleaned = name.trim().replace(/\//g, '-');
  if (!cleaned) {
    return { problem: 'empty' };
  }
  if (joinDeckPath(parentPath, cleaned).length > MAX_DECK_PATH_LENGTH) {
    return { problem: 'tooLong' };
  }
  if (siblings.includes(cleaned)) {
    return { problem: 'exists' };
  }
  return { name: cleaned };
}
