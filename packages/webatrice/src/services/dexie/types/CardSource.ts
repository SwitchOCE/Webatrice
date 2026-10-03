import type { Card } from './Card';
import type { Format } from './Format';
import type { Info } from './Info';
import type { Set } from './Set';
import type { Token } from './Token';

/**
 * Where a layer of the card database came from. Mirrors the files desktop
 * Cockatrice loads on every (re)load, in this order
 * (card_database_loader.cpp `doLoadCardDatabases`): the main `cards.xml`,
 * `tokens.xml`, `spoiler.xml`, then every file in the custom sets folder
 * alphabetically — which is also where `dlg_edit_tokens` saves `TK.xml`.
 *
 * `legacy` stands for the records a pre-v7 install imported before sources
 * were tracked. Those installs could only import cards.xml, tokens.xml and
 * spoiler.xml, all into the same tables, so it loads after the three
 * re-importable files and stays until all three have been imported again or
 * the user removes it.
 */
export type CardSourceKind = 'main' | 'tokens' | 'spoiler' | 'custom' | 'user-tokens' | 'legacy';

/** Fixed id of the source standing for a pre-v7 import. */
export const LEGACY_SOURCE_ID = 'legacy';

/** Fixed id of the token editor's source (desktop's `customsets/TK.xml`). */
export const USER_TOKENS_SOURCE_ID = 'user-tokens';

export type CardSourceOrigin = 'file' | 'url' | 'editor' | 'migration';

export interface CardSourceRecords {
  cards: Card[];
  sets: Set[];
  tokens: Token[];
  formats: Format[];
  info?: Info;
}

export interface CardSourceCounts {
  cards: number;
  sets: number;
  tokens: number;
  formats: number;
}

export class CardSource {
  id: string;
  kind: CardSourceKind;
  fileName: string;
  origin: CardSourceOrigin;
  /** Upstream URL when `origin === 'url'`. */
  url?: string;
  /** Load position among `custom` sources (desktop's `NN.` file prefix). */
  order: number;
  importedAt: string;
  counts: CardSourceCounts;
  sourceVersion?: string;
  author?: string;
  createdAt?: string;
}

/**
 * A source's contents, one row per source in their own table so listing the
 * sources never reads a whole database. A `legacy` source has no payload until
 * its first rebuild: until then its records are the card tables themselves.
 */
export interface CardSourcePayload {
  id: string;
  /** Raw Cockatrice XML, re-parsed on every reload like desktop re-reads its files. */
  xml?: string;
  /** Pre-parsed records, for sources that have no XML (editor tokens, legacy data). */
  records?: CardSourceRecords;
}
