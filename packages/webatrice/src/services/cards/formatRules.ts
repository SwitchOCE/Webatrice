import { FormatDTO, type Format } from '../dexie';

/**
 * The format rules (`<formats>` in the imported cards.xml) for a deck format
 * name, matched case-insensitively — desktop `CardDatabase::getFormat`.
 * `undefined` when no card database with that format was imported.
 */
export async function getFormatRules(formatName: string): Promise<Format | undefined> {
  if (!formatName.trim()) {
    return undefined;
  }
  return FormatDTO.get(formatName.trim());
}
