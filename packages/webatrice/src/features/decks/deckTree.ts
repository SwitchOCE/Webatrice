import type { ServerInfo_DeckStorage_Folder } from '@cockatrice/sockatrice/generated';

/**
 * Whether other users see a deck or folder (Cockatrice 3.1 public decks).
 * `inherited`: private itself, but a folder above it is public — desktop's
 * "Public (inherited)" column. Always `private` on a 3.0 server.
 */
export type DeckVisibility = 'public' | 'inherited' | 'private';

export function deckVisibility(ownBit: boolean | undefined, underPublicFolder: boolean): DeckVisibility {
  if (ownBit) {
    return 'public';
  }
  return underPublicFolder ? 'inherited' : 'private';
}

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
  /** Published to other users (3.1 servers; absent means private). */
  isPublic?: boolean;
  /** Stored color identity, e.g. "WUB" (3.1 servers; empty for older uploads). */
  colorIdentity?: string;
  /** What other users see, counting a public folder above the deck. */
  visibility: DeckVisibility;
}

/**
 * Recursively walk a Servatrice folder tree collecting only files (leaf
 * decks). `pathPrefix` is the display path from the root; `underPublicFolder`
 * says whether a folder above `folder` is public.
 */
export function flattenFolder(
  folder: ServerInfo_DeckStorage_Folder,
  pathPrefix: string,
  underPublicFolder = false,
): FlatDeck[] {
  const inherited = underPublicFolder || !!folder.isPublic;
  const out: FlatDeck[] = [];
  for (const item of folder.items) {
    if (item.file && item.id) {
      out.push({
        id: item.id,
        name: item.name || `Deck #${item.id}`,
        path: pathPrefix,
        creationTime: item.file.creationTime ?? 0,
        isPublic: item.file.isPublic,
        colorIdentity: item.file.colorIdentity,
        visibility: deckVisibility(item.file.isPublic, inherited),
      });
    } else if (item.folder) {
      const nextPath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
      out.push(...flattenFolder(item.folder, nextPath, inherited));
    }
  }
  return out;
}

/**
 * A deck's age for the list view: a key (`Decks.list.age.*`) for the two
 * worded cases, else text already formatted for `locale`.
 */
export type DeckAge = { key: 'unknown' | 'justNow' } | { text: string };

// One formatter per locale: the list formats every row's age on each render.
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormat(locale: string): Intl.RelativeTimeFormat {
  let format = relativeFormats.get(locale);
  if (!format) {
    format = new Intl.RelativeTimeFormat(locale || undefined, { style: 'narrow' });
    relativeFormats.set(locale, format);
  }
  return format;
}

/**
 * Loose "3h ago" formatter for Unix seconds. Good enough for the list view;
 * the editor can show absolute timestamps. `locale` is a BCP 47 tag (the UI
 * language); empty falls back to the runtime default.
 */
export function formatDeckAge(unixSeconds: number, locale: string, now = Date.now()): DeckAge {
  if (!unixSeconds) {
    return { key: 'unknown' };
  }
  const then = new Date(unixSeconds * 1000);
  const diffSec = (now - then.getTime()) / 1000;
  if (diffSec < 60) {
    return { key: 'justNow' };
  }
  const relative = relativeFormat(locale);
  if (diffSec < 3600) {
    return { text: relative.format(-Math.floor(diffSec / 60), 'minute') };
  }
  if (diffSec < 86400) {
    return { text: relative.format(-Math.floor(diffSec / 3600), 'hour') };
  }
  if (diffSec < 604800) {
    return { text: relative.format(-Math.floor(diffSec / 86400), 'day') };
  }
  return { text: then.toLocaleDateString(locale || undefined) };
}
