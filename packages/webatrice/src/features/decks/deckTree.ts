import { isFieldSet } from '@bufbuild/protobuf';
import {
  ServerInfo_DeckStorage_FileSchema,
  type ServerInfo_DeckStorage_File,
  type ServerInfo_DeckStorage_Folder,
} from '@cockatrice/sockatrice/generated';

export type DeckVisibility = 'public' | 'inherited' | 'private';

export function deckVisibility(ownBit: boolean | undefined, underPublicFolder: boolean): DeckVisibility {
  if (ownBit) {
    return 'public';
  }
  return underPublicFolder ? 'inherited' : 'private';
}

export interface FlatDeck {
  id: number;
  name: string;
  /** Folder path from root, `""` for root-level decks. */
  path: string;
  /** Unix seconds. Not `updated_at` — Servatrice only tracks creation. */
  creationTime: number;
  isPublic?: boolean;
  colorIdentity?: string;
  bannerCardName?: string;
  bannerCardProvider?: string;
  tags?: string[];
  visibility: DeckVisibility;
}

function storedPreview(file: ServerInfo_DeckStorage_File): Pick<FlatDeck, 'bannerCardName' | 'bannerCardProvider' | 'tags'> {
  const preview: Pick<FlatDeck, 'bannerCardName' | 'bannerCardProvider' | 'tags'> = {};
  if (file.bannerCardName) {
    preview.bannerCardName = file.bannerCardName;
    if (file.bannerCardProvider) {
      preview.bannerCardProvider = file.bannerCardProvider;
    }
  }
  if (file.tags.length > 0) {
    preview.tags = [...file.tags];
  }
  return preview;
}

export function findDeckFile(folder: ServerInfo_DeckStorage_Folder | undefined, deckId: number): ServerInfo_DeckStorage_File | undefined {
  for (const item of folder?.items ?? []) {
    if (item.id === deckId && item.file) {
      return item.file;
    }
    if (item.folder) {
      const file = findDeckFile(item.folder, deckId);
      if (file) {
        return file;
      }
    }
  }
  return undefined;
}

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
        colorIdentity: isFieldSet(item.file, ServerInfo_DeckStorage_FileSchema.field.colorIdentity)
          ? item.file.colorIdentity : undefined,
        ...storedPreview(item.file),
        visibility: deckVisibility(item.file.isPublic, inherited),
      });
    } else if (item.folder) {
      const nextPath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
      out.push(...flattenFolder(item.folder, nextPath, inherited));
    }
  }
  return out;
}
