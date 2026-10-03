import Dexie, { type Transaction } from 'dexie';

import { defaultSetOrder, isKnownIgnored, setCode } from '../../cardDatabase/setPriority';
import { LEGACY_SOURCE_ID, type CardSource, type Info, type Set, type SetPreference } from '../types';
import { Stores } from './v2.schema';

export { LEGACY_SOURCE_ID };

/**
 * v7 upgrade. Existing installs already hold imported cards but no record of
 * where they came from: add a `legacy` source that stands for them, and seed
 * set preferences the way desktop's first run does (`guessSortKeys` +
 * `enableAll`) so art priority works immediately.
 *
 * The legacy source is only a marker (counts and info). Copying the cards into
 * it here would hold the whole database in memory and write it as one value
 * inside the versionchange transaction, where a failed write leaves the
 * database unopenable. The first rebuild reads its records from the card
 * tables instead (`CardDatabaseService`).
 */
export async function migrateToV7(tx: Transaction): Promise<void> {
  const [cards, sets, tokens, formats, info] = await Promise.all([
    tx.table(Stores.CARDS).count(),
    tx.table<Set>(Stores.SETS).toArray(),
    tx.table(Stores.TOKENS).count(),
    tx.table(Stores.FORMATS).count(),
    tx.table<Info>(Stores.INFO).toCollection().first(),
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

  if (cards || sets.length || tokens || formats) {
    const source: CardSource = {
      id: LEGACY_SOURCE_ID,
      kind: 'legacy',
      fileName: 'cards.xml',
      origin: 'migration',
      order: 0,
      importedAt: info?.importedAt ?? new Date().toISOString(),
      counts: { cards, sets: sets.length, tokens, formats },
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
      [Stores.CARD_SOURCE_PAYLOADS]: 'id',
      [Stores.SET_PREFERENCES]: 'code',
      [Stores.CARD_DATA_SETTINGS]: 'id',
    })
    .upgrade(migrateToV7);
};
