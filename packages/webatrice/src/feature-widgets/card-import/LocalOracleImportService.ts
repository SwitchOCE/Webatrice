import { Card, Format, Info, Set, Token } from '@app/services';

import { cardDatabaseService, type RebuildResult } from './CardDatabaseService';
import { cockatriceXmlParser } from './CockatriceXmlParser';

const ACCEPTED_FILENAME = /^(cards|tokens|spoiler)\.xml$/i;
const XML_FILENAME = /\.xml$/i;

export interface IngestedFile {
  name: string;
  xml: string;
}

export interface IngestResult {
  cards: Card[];
  sets: Set[];
  tokens: Token[];
  formats: Format[];
  info?: Info;
  acceptedFiles: string[];
  skippedFiles: string[];
  /** The accepted files' contents, kept so they can be stored as sources. */
  files: IngestedFile[];
}

export interface IngestOptions {
  /**
   * Accept any `.xml` as a custom set file (desktop's "Add custom sets/cards")
   * rather than only Oracle's cards.xml / tokens.xml / spoiler.xml.
   */
  allowCustomSets?: boolean;
}

class LocalOracleImportService {
  async ingest(files: File[], options: IngestOptions = {}): Promise<IngestResult> {
    const accepted = options.allowCustomSets ? XML_FILENAME : ACCEPTED_FILENAME;
    const result: IngestResult = {
      cards: [],
      sets: [],
      tokens: [],
      formats: [],
      acceptedFiles: [],
      skippedFiles: [],
      files: [],
    };

    for (const file of files) {
      if (!accepted.test(file.name)) {
        result.skippedFiles.push(file.name);
        continue;
      }

      const text = await file.text();
      const parsed = cockatriceXmlParser.parse(text);

      result.acceptedFiles.push(file.name);
      result.files.push({ name: file.name, xml: text });

      if (parsed.info) {
        result.info = parsed.info;
      }
      if (parsed.cards) {
        result.cards.push(...parsed.cards);
      }
      if (parsed.sets) {
        result.sets.push(...parsed.sets);
      }
      if (parsed.tokens) {
        result.tokens.push(...parsed.tokens);
      }
      if (parsed.formats) {
        result.formats.push(...parsed.formats);
      }
    }

    return result;
  }

  /**
   * Store each accepted file as a card-database source and rebuild the card
   * tables from all sources in one transaction. Re-importing a file replaces
   * the source of the same kind (cards.xml replaces cards.xml); custom set
   * files are added alongside the ones already loaded.
   */
  persist(ingest: Pick<IngestResult, 'files'>): Promise<RebuildResult> {
    return cardDatabaseService.addSources(
      ingest.files.map((file) => ({ fileName: file.name, xml: file.xml, origin: 'file' as const })),
    );
  }
}

export const localOracleImportService = new LocalOracleImportService();
