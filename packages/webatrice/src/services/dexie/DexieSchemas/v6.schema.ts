import Dexie from 'dexie';

import { migrateSetting } from '../settingsMigration';
import { Stores } from './v2.schema';

// Version 6 versions the settings row: existing rows (auto-connect, inverted coordinates and
// shortcut overrides) are kept and run through every `migrateSetting` step, which backfills the
// Settings page's preferences with their desktop defaults, keeps upgraders on the dark palette
// and adopts a language they picked before it was a setting. Non-indexed fields, so the store spec is unchanged.
// Version 5 belongs to the replays cache; Dexie allows the gap when that lands separately.
export const schemaV6 = (db: Dexie) => {
  db.version(6)
    .stores({})
    .upgrade((tx) => tx.table(Stores.SETTINGS).toCollection().modify((row) => {
      migrateSetting(row);
    }));
};
