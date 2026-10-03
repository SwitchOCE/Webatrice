import Dexie, { type Transaction } from 'dexie';

import { defaultSetOrder, isKnownIgnored, setCode } from '../../cardDatabase/setPriority';
import type { Card, CardSource, Format, Info, Set, SetPreference, Token } from '../types';
import { Stores } from './v2.schema';

export const LEGACY_SOURCE_ID = 'legacy';

/**
 * v7 upgrade. Existing installs already hold imported cards but no record of
 * where they came from: wrap them in a `legacy` source so the first rebuild
 * keeps them, and seed set preferences the way desktop's first run does
 * (`guessSortKeys` + `enableAll`) so art priority works immediately.
 */
export async function migrateToV7(tx: Transaction): Promise<void> {
  const [cards, sets, tokens, formats, infos] = await Promise.all([
    tx.table<Card>(Stores.CARDS).toArray(),
    tx.table<Set>(Stores.SETS).toArray(),
    tx.table<Token>(Stores.TOKENS).toArray(),
    tx.table<Format>(Stores.FORMATS).toArray(),
    tx.table<Info>(Stores.INFO).toArray(),
  ]);

  if (sets.length) {
    const preferences: SetPreference[] = defaultSetOrder(sets).map((set, i) => ({
      code: setCode(set),
      sortKey: i,
      enabled: true,
      isKnown: !isKnownIgnored(set),
    }));
    await tx.table<SetPreference>(Stores.SET_PREFERENCES).bulkPut(preferences);
  }

  if (cards.length || sets.length || tokens.length || formats.length) {
    const info = infos[0];
    const source: CardSource = {
      id: LEGACY_SOURCE_ID,
      kind: 'legacy',
      fileName: 'cards.xml',
      origin: 'migration',
      order: 0,
      importedAt: info?.importedAt ?? new Date().toISOString(),
      counts: { cards: cards.length, sets: sets.length, tokens: tokens.length, formats: formats.length },
      records: { cards, sets, tokens, formats, info },
      sourceVersion: info?.sourceVersion,
      author: info?.author,
      createdAt: info?.createdAt,
    };
    await tx.table<CardSource>(Stores.CARD_SOURCES).put(source);
  }
}

// Version 5 belongs to the replays cache and version 6 to the settings row; Dexie allows the
// gap while the replays cache lands separately.
export const schemaV7 = (db: Dexie) => {
  db.version(7)
    .stores({
      [Stores.CARD_SOURCES]: 'id',
      [Stores.SET_PREFERENCES]: 'code',
      [Stores.CARD_DATA_SETTINGS]: 'id',
    })
    .upgrade(migrateToV7);
};
